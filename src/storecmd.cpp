/* -*- Mode: C; c-file-style: "stroustrup"; indent-tabs-mode:nil; -*- */

#include <stdio.h>
#include <stdlib.h>
#include <ctype.h>
#include <malloc.h>
#include <errno.h>
#include "mvstore.h"
#include "startup.h"
#include "storenotifier.h"
#include "portability.h"
#include "intr.h"
#include "storecmd.h"

// anonymous for now because user/pass attempt not working

#define ANONYMOUS

const char* storedir = NULL;

using namespace MVStore;

#define IDENTITY "test"
#define PASSWORD "password"

#ifdef WIN32
#define _LX_FM "%016I64X"
#else
#define _LX_FM "%016LX"
#endif

/**
 * MvStoreMgr will become the manager of all store instances.
 * Currently it only deals with one store.
 * Note: Multi-store management can become non-trivial (e.g. open on demand etc.).
 */
class MvStoreMgr {
protected:
 // Note: In real life this would be a list, but for demo sake a
 // single user is probably all we need.
    MVStoreCtx store;
    MainNotificationHandler* notificationHandler;
    int bMVEngine;
    int auto_create;
public:
    MvStoreMgr( int create ) {
        auto_create = create;
        bMVEngine = 0;
	// not so anonymous anymore
	StartupParameters params;
        params.directory = storedir;
#if !defined(ANONYMOUS)
	params.password = PASSWORD;
#endif
	notificationHandler = new MainNotificationHandler();
	params.notification = notificationHandler;
	RC res = openStore( params, store );
	if ( res == RC_NOTFOUND && auto_create ) {
	    StoreCreationParameters create_params;
#if !defined(ANONYMOUS)
	    create_params.identity = IDENTITY;
	    create_params.password = PASSWORD;
#endif
	    res = createStore( create_params, params, store );
	    if ( res != RC_OK ) {
		printf("Mvstore error: (%d)\n", res);
	    }
	}
    }

    MvStoreMgr( void *ctx ) 
	: store(*(MVStoreCtx*)ctx), bMVEngine(1), auto_create(0) {}

    ~MvStoreMgr() { if (!bMVEngine) { shutdownStore( store ); } }

    MVStoreCtx getStore() { return store; }
    MainNotificationHandler* getNotificationHandler( MVStoreCtx /* Note: in a multi-store context this will be needed. */ ) { return notificationHandler; }
};

void strerror( RC rc, ISession& sess, CompilationError& ce, 
               char*& res, size_t& len ) {
    if ( rc == RC_SYNTAX && ce.msg ) {
        if ( !res ) {
            len = ce.pos+strlen(ce.msg)+50;
            res = (char*)sess.alloc( len+1 );
        }
        len = snprintf( res, len, "%*s\nSyntax: %s at %d, line %d\n", 
                        ce.pos+2, "^", ce.msg, ce.pos, ce.line );
    } else if ( rc != RC_OK ) {
        if ( !res ) {
            len = 50; res = (char*)sess.alloc( len+1 );
        }
        len = snprintf( res, len, "Mvstore error: (%d)\n", rc );
    }
}

#define DIGITS "0123456789"

void str2value( ISession& sess, Value* vals, 
                char** params, unsigned nparams ) {
    RC rc;
    
    for ( unsigned i = 0; i < nparams; i++ ) {
        char* p = params[i];
        Value& v = vals[i];
        if ( !p ) {                 /* NULL */
            v.setError();
        } else {
            CompilationError lCE;
            /* the store kernel can do this now, so below code obsoleted */
            rc = sess.parseValue( p, strlen(p), v, &lCE );
            if ( rc != RC_OK ) { v.setError(); }
        } 
    }
}

#define MAX_ALLOCA 10240

#define ALLOCA( se, n, sz, yes )                                        \
    ( (*(yes)=((n)*(sz)>MAX_ALLOCA) ) ? (se)->alloc( (n)*(sz) ) :       \
      alloca( (n)*(sz) ) )
#define AFREE( se, yes, ptr ) \
    do { if ( (yes) && (ptr) ) { (se)->free(ptr); } } while (0)

RC mvs_expr2jsoni( ISession& sess, const char* pExpr, 
                   char*& pErr, size_t& len, 
                   char** params, unsigned nparams,
                   Value** v ) {
    printf("\nexpression:\n%s\n", pExpr); 
    CompilationError lCE;

    if ( !v ) { return RC_INTERNAL; }
    int alloc;

    Value* vals = (Value*)ALLOCA( &sess, nparams, sizeof(Value), &alloc );
    str2value( sess, vals, params, nparams );

    IExpr *const expr = sess.createExpr(pExpr, NULL, 0, &lCE);

    AFREE( &sess, alloc, vals );
    if ( !expr ) { strerror( RC_SYNTAX, sess, lCE, pErr, len ); }

    *v = (Value*)sess.alloc( sizeof( Value ) );
    const RC rc = expr->execute( **v, vals, nparams ); 
    if ( rc != RC_OK ) {
        printf("Mvstore error: (%d)\n", rc);
    } else {
        sess.convertValue( **v, **v, VT_STRING );
    }

    return rc;
}

RC mvs_sql2jsoni( ISession& sess, const char* pCmd, 
                  char*& pResult, size_t& len, 
                  char** params, unsigned nparams,
                  unsigned off = 0, unsigned lim = ~0u ) {
    printf("\ncommand:\n%s\n", pCmd); 
    CompilationError lCE;

    int alloc;

    Value* vals = (Value*)ALLOCA( &sess, nparams, sizeof(Value), &alloc );
    str2value( sess, vals, params, nparams );

    const RC rc = sess.execute( pCmd, strlen(pCmd), &pResult, NULL, 0, 
                                vals, nparams, &lCE, NULL, lim, off );
    AFREE( &sess, alloc, vals );
    if ( rc != RC_OK ) { strerror( rc, sess, lCE, pResult, len ); }

    return rc;
}

ssize_t mvs_sql2rawi( ISession& sess, mvs_stream_t* pCtx, 
                      const char* pCmd, char*& pResult, Twriter pWriter,
                      char** params, unsigned nparams,
                      unsigned offset = 0, unsigned limit = ~0u ) {
    printf("\ncommand:\n%s\n", pCmd); 
    CompilationError lCE;
    IStmt *const stmt = sess.createStmt(pCmd, NULL, 0, &lCE);

    if ( !stmt ) {
        char* err = NULL;
        size_t len;
        strerror( RC_SYNTAX, sess, lCE, err, len );
        printf( "%s", err );
        sess.free( err );
        return (ssize_t)-1;
    }

    int alloc;
    Value* vals = (Value*)ALLOCA( &sess, nparams, sizeof(Value), &alloc );
    str2value( sess, vals, params, nparams );
    IStreamOut* out = NULL;
    RC res = stmt->execute( out, vals, nparams, limit, offset );
    AFREE( &sess, alloc, vals );
    //if ( res == RC_SYNTAX && lCE.msg)
    //    printf("%*s\nSyntax: %s at %d, line %d\n", lCE.pos+2, "^", 
    //    lCE.msg, lCE.pos, lCE.line);
    ssize_t off = 0;
    if ( res != RC_OK ) {
        printf("Mvstore error: (%d)\n", res);
    } else {
#ifdef STREAM_CLOSE
        unsigned char buf[0x1000];
        size_t got = 0x1000;
        while ( !intr && (res = out->next(buf, got)) == RC_OK ) {
            if ( (*pWriter)(pCtx, buf, got) < (ssize_t)got ) {
                printf("warning: failed to write %lu bytes (read from the store) to the socket\n", (unsigned long)got);
                res = RC_OTHER;
                break;
            }
            got = 0x1000;
        }
        out->destroy();
#else
        unsigned len = 0x1000;
        unsigned char* buf = (unsigned char*)sess.alloc( len );
        size_t got = len;
        if ( buf == NULL ) { 
            res = RC_OTHER; 
        } else {
            while ( !intr && (res = out->next(buf+off, got)) == RC_OK ) {
                off += got;
                if ( len - off < len/2 ) {
                    len += len/2;
                    buf = (unsigned char*)sess.realloc( buf, len );
                    if ( buf == NULL ) { res = RC_OTHER; break; }
                }
                got = len - off;
            }
        }
        out->destroy();
        pResult = (char*)buf;
#endif
    }
    stmt->destroy();
    return (res == RC_OK || res == RC_EOF) ? off : size_t(-1);
}

/*
class MvReader : public IStreamIn
{
    protected:
        void *const mReaderCtx;
        const Treader mReader;
    public:
        MvReader(void * pReaderCtx, Treader pReader) : mReaderCtx(pReaderCtx), mReader(pReader) {}
        virtual RC next(unsigned char *buf,size_t lBuf) { if (mReader && (*mReader)(mReaderCtx, buf, lBuf) > 0) return RC_OK; return RC_FALSE; }
        virtual void destroy() { delete this; }
};
*/

class WriterIStreamIn : public IStreamIn {
    Twriter writer;
    mvs_stream_t* ctx;
protected:
    WriterIStreamIn() {}
public:
    WriterIStreamIn( Twriter& w, mvs_stream_t* c ) { writer = w; ctx = c; }
    virtual RC next( const unsigned char *buf, size_t len ) {
        ssize_t wrote = writer( ctx, buf, len );
        if ( wrote < 0 || (size_t)wrote < len ) {
            return RC_OTHER;
        }
        return RC_OK;
    }

    virtual void destroy( void ) {}
};

int mvs_raw2rawi( ISession& sess, mvs_stream_t* ctx, 
                  Treader reader, Twriter writer ) {
    // For the moment this is limited to raw in, simple ack out.

    IStreamIn *in = NULL;
    WriterIStreamIn out( writer, ctx );
    if ( !reader || sess.createInputStream( in, &out ) != RC_OK ) {
        return 0;
    }

    unsigned char buf[0x1000];
    ssize_t lRead = 1, got = 0, use, need;
    RC res = RC_OK;
    if ( ctx->len > 0 ) {
        use = ctx->clen > 0 ? ( MIN( ctx->clen, ctx->len ) ) : ctx->len;
        res = in->next( (unsigned char*)ctx->buf, use );
        got += use;
    }
    while ( !intr && res == RC_OK && lRead > 0 && ( ctx->clen >= 0 ? got < (ssize_t)ctx->clen : 1 ) ) {
        need = ctx->clen >= got ? ctx->clen - got : sizeof(buf);
        lRead = reader( ctx, buf, MIN( need, (ssize_t)sizeof(buf) ) );
        if ( lRead > 0 ) {
            got += lRead;
            res = in->next( buf, lRead );
        }
    }
    if ( lRead < 0 ) { res = RC_OTHER; }
    /* this completes a pin insertion */
    if ( res == RC_OK ) { res = in->next( NULL, 0 ); }
    in->destroy();

    return (res == RC_OK) ? 1 : 0;
}

extern "C"
{
    void* mvs_init( void* ctx, int auto_create ) { 
        MvStoreMgr* mgr;
        MVStoreCtx store = NULL;
        if ( ctx ) { /* store instance from mvEngine */
            mgr = new MvStoreMgr( ctx );
        } else {
            mgr = new MvStoreMgr( auto_create );
        }
        store = mgr->getStore();
        if ( !store ) { delete mgr; return NULL; }
        return mgr;
    }

    void mvs_session( void* mgrp, session_t* sess ) {
        MvStoreMgr* mgr = (MvStoreMgr*)mgrp;
        if ( mgr == NULL ) { sess->ptr = NULL; return; }
        MVStoreCtx store = mgr->getStore();
        if ( !store ) { 
            sess->ptr = NULL; 
        } else {
            sess->ptr = ISession::startSession( store );
        }
    }

    int mvs_close( session_t* sessp ) {
        ISession* sess = (ISession*)sessp->ptr;
        if ( sess ) { sess->terminate(); }
        sessp->ptr = NULL;
        return 1;
    }

    void mvs_free( session_t* sessp, void* ptr ) {
        ISession* sess = (ISession*)sessp->ptr;
        if ( !sess ) { return; }
        sess->free( ptr );
    }

    void mvs_freev( session_t* sessp, void* v ) {
        ISession* sess = (ISession*)sessp->ptr;
        if ( !sess ) { return; }
        sess->freeValue( *(Value*)v );
        sess->free( v );
    }

    const char* mvs_val2str( void* pValue ) { return ((Value*)pValue)->str; }

    uint32_t mvs_val2len( void* pValue ) { return ((Value*)pValue)->length; }

    int mvs_expr2json( session_t* sessp, const char* pUser, 
                       const char* pPassword, const char* pCmd, 
                       char** ppError, size_t* len, 
                       char** params, unsigned nparams,
                       void** ppValue ) {
        ISession* sess = (ISession*)sessp->ptr;
	if ( !sess ) { return 0; }
        size_t ignore = 0;
	if ( ppError == NULL ) { return 0; }
        char*& pError = *ppError;
        if ( len == NULL ) { len = &ignore; }
	RC res = mvs_expr2jsoni( *sess, pCmd, pError, *len, 
                                 params, nparams, (Value**)ppValue );
	return res == RC_OK ? 1 : 0;
    }

    int mvs_sql2json( session_t* sessp, const char* pUser, 
                      const char* pPassword, const char* pCmd, 
                      char** ppResult, size_t* len, 
                      char** params, unsigned nparams,
                      unsigned off, unsigned lim ) {
        ISession* sess = (ISession*)sessp->ptr;
	if ( !sess ) { return 0; }
        size_t ignore = 0;
	if ( ppResult == NULL ) { return 0; }
        char*& pResult = *ppResult;
        if ( len == NULL ) { len = &ignore; }
	RC res = mvs_sql2jsoni( *sess, pCmd, pResult, *len, 
                                params, nparams, off, lim );

	return res == RC_OK ? 1 : 0;
    }

    ssize_t mvs_sql2raw( session_t* sessp, const char* user, const char* pass, 
                         const char* qry, char** ppResult, 
                         mvs_stream_t* ctx, Twriter writer,
                         char** params, unsigned nparams,
                         unsigned off, unsigned lim ) {
        ISession* sess = (ISession*)sessp->ptr;
        if ( !sess ) { return 0; }
        char*& pResult = *ppResult;
        ssize_t res = mvs_sql2rawi( *sess, ctx, qry, pResult, writer, 
                                    params, nparams, off, lim );
        return res;
    }

    int mvs_raw2raw( session_t* sessp, const char* user, const char* pass, 
                     mvs_stream_t* pCtx, Treader pReader, Twriter pWriter ) {
        ISession* sess = (ISession*)sessp->ptr;
        int res = mvs_raw2rawi(*sess, pCtx, pReader, pWriter);
        return res;
    }

    int mvs_sql2count( session_t* sessp, const char* user, const char* pass,
                       const char* query, char** res, size_t* len,
                       char** params, unsigned nparams, uint64_t* count ) {
        ISession* sess = (ISession*)sessp->ptr;
	if ( !sess ) { return 0; }
        CompilationError ce;
        IStmt *const stmt = sess->createStmt( query, NULL, 0, &ce );

        if ( !stmt ) {
            size_t llen = len ? *len : 0;
            strerror( RC_SYNTAX, *sess, ce, *res, llen );
            return 0;
        }

        int alloc;
        Value* vals = (Value*)ALLOCA( sess, nparams, sizeof(Value), &alloc );
        str2value( *sess, vals, params, nparams );

        RC rc = stmt->count( *count, vals, nparams );
        AFREE( sess, alloc, vals );
        if ( rc != RC_OK ) {
            strerror( rc, *sess, ce, *res, *len );
            return rc == RC_OK ? 1 : 0;
        }
        return 1;
    }
                       
    int mvs_sql2plan( session_t* sessp, const char* user, const char* pass,
                      const char* query, char** res,
                      char** params, unsigned nparams ) {
        ISession* sess = (ISession*)sessp->ptr;
	if ( !sess ) { return 0; }
        CompilationError ce;
        IStmt *const stmt = sess->createStmt( query, NULL, 0, &ce );

        size_t len = 0;
        if ( !stmt ) {
            strerror( RC_SYNTAX, *sess, ce, *res, len );
            return 0;
        }

        int alloc;
        Value* vals = (Value*)ALLOCA( sess, nparams, sizeof(Value), &alloc );

        str2value( *sess, vals, params, nparams );

        RC rc = stmt->analyze( *res, vals, nparams );
        AFREE( sess, alloc, vals );
        if ( rc != RC_OK ) {
            strerror( rc, *sess, ce, *res, len );
            return rc == RC_OK ? 1 : 0;
        }
        /* workaround - anaylze of insert? */
        if ( rc == RC_OK && *res == NULL ) { 
            *res = (char*)sess->alloc( strlen("insert")+1 );
            strcpy( *res, "insert" );
        }
        return 1;
    }
    
    int mvs_sql2display( session_t* sessp, const char* user, const char* pass,
                         const char* query, char** res ) {
        ISession* sess = (ISession*)sessp->ptr;
	if ( !sess ) { return 0; }
        CompilationError ce;
        IStmt *const stmt = sess->createStmt( query, NULL, 0, &ce );

        size_t len = 0;
        if ( !stmt ) {
            strerror( RC_SYNTAX, *sess, ce, *res, len );
            return 0;
        }

        *res = stmt->toString(); /* this can be NULL */

        return 1;
    }

    int mvs_regNotif( void* db, session_t* sessp, 
                      const char* user, const char* pass,
                      const char* type, const char* notifparam, 
                      const char* clientid, char **res ) {
        MainNotificationHandler* const mainh = ((MvStoreMgr*)db)->getNotificationHandler( ((MvStoreMgr*)db)->getStore(/*user,pw,storeid*/) );
        return ( mainh && RC_OK == mvs_regNotifi( *mainh, *(ISession*)sessp->ptr, type, notifparam, clientid, res ) ) ? 1 : 0;
    }

    int mvs_unregNotif( void* db, session_t* sessp, 
                        const char* user, const char* pass,
                        const char* notifparam, const char* clientid, 
                        char **res ) {
        MainNotificationHandler* const mainh = ((MvStoreMgr*)db)->getNotificationHandler( ((MvStoreMgr*)db)->getStore(/*user,pw,storeid*/) );
        return ( mainh && RC_OK == mvs_unregNotifi( *mainh, *(ISession*)sessp->ptr, notifparam, clientid, res ) ) ? 1 : 0;
    }

    int mvs_waitNotif( void* db, session_t* sessp, 
                       const char* user, const char* pass,
                       const char* notifparam, const char* clientid, 
                       int timeout, char **res ) {
        MainNotificationHandler* const mainh = ((MvStoreMgr*)db)->getNotificationHandler( ((MvStoreMgr*)db)->getStore(/*user,pw,storeid*/) );
        return ( mainh && RC_OK == mvs_waitNotifi( *mainh, *(ISession*)sessp->ptr, notifparam, clientid, timeout, res ) ) ? 1 : 0;
    }

    void mvs_term( void *pMgr ) { 
        if ( pMgr ) { delete (MvStoreMgr *)pMgr; }
    }
};
