/* -*- Mode: C; c-file-style: "stroustrup"; indent-tabs-mode:nil; -*- */
/*
Copyright (c) 2004-2013 GoPivotal, Inc. All Rights Reserved.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,  WITHOUT
WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
License for the specific language governing permissions and limitations
under the License.
*/

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <time.h>
#include <sys/types.h>
#include <fcntl.h>
#include <time.h>
#include <assert.h>
#include "portability.h"
#include "socket.h"
#include "storecmd.h"
#include "http.h"
#include "afyhttp.h"
#include "afydaemon.h"
#include "intr.h"

/* AFFINITYD: an embedded server - simple, threading so allowing
   blocking, CPU and IO intensive DB calls, also includes a static web
   server and basic mime support */

int afyd_verbose = 0;
int www_service = 0;

#define AFYD_SERVER "affinityd"
#define AFYD_ENGINE "afyengine"

#define AFYD_NAME_MAX 100
char AFYD_NAME[AFYD_NAME_MAX] = AFYD_SERVER;

#define BUF_SIZE 16384

char docroot[PATH_MAX+1];
size_t docroot_len = 0;

int match_alias( const char* cgi, const char* sep, const char* path ) {
    size_t cgi_len = strlen(cgi);
    size_t path_len = strlen(path);
    if ( path_len < cgi_len ) { return 0; }
    if ( strncmp( cgi, path, cgi_len ) != 0 ) { return 0; }
    if ( strchr( sep, path[cgi_len] ) == NULL ) { return 0; }
    return 1;
}

#define HELLO "hello world\n"
#define MAX_POST (1024*1024)

ssize_t http_resp( int sock, int code, const char* desc, const char* header,
                   const char* explain, size_t expl_len ) {
    char err[BUF_SIZE+1], conlen[20+1];
    int elen;
    ssize_t r, rt;
    
    if ( explain ) { 
        if ( expl_len == 0 ) { expl_len = strlen( explain ); }
        snprintf( conlen, 20, "%d", expl_len ); 
    }
    elen = snprintf( err, BUF_SIZE, 
		     "HTTP/1.1 %d %s" CRLF
		     "Server: %s %1.2f" CRLF
		     "%s"       /* extra headers */
                     "%s%s%s"   /* optional Content-length: %d \r\n */
                     CRLF,
                     code, desc, AFYD_NAME, AFYD_VERS, 
		     header ? header : "", explain ? LENGTH : "", 
                     explain ? conlen : "", explain ? CRLF : "" );
    if ( code >= 300 ) {		/* only log on error codes */
	LOG_LINE( kLogError, explain );
    }
    if ( afyd_verbose ) {
        LOG_LINE( kLogInfo, "response headers: %s", err );
    }
    r = sock_write( sock, err, elen );
    if ( explain && r == elen ) {
        rt = sock_write( sock, explain, expl_len );
        if ( rt > 0 ) {
            r += rt;
        }
        if ( afyd_verbose > 1 ) {
            LOG_LINE( kLogInfo, "response body (len = %d): %s", expl_len, explain );
        }
    }
    return r;
}

off_t fdsize( int fd ) {
    struct stat stats;

    if ( fstat( fd, &stats ) != 0 ) { 
	return -1;              /* -1 means no such file */
    }
    return stats.st_size;
}

const char* mime_type( const char* e ) {
    if ( !e ) { return MIME_OCTET; }
    if ( strcasecmp( e, "htm" ) == 0 || strcasecmp( e, "html" ) == 0 ) {
        return MIME_HTML;
    } else if ( strcasecmp( e, "js" ) == 0 ) {
        return MIME_JSCRIPT;
    } else if ( strcasecmp( e, "ico" ) == 0 ) {
        return MIME_ICO;
    } else if ( strcasecmp( e, "gif" ) == 0 ) {
        return MIME_GIF;
    } else if ( strcasecmp( e, "jpg") == 0 || strcasecmp( e, "jpeg" ) == 0) {
        return MIME_JPG;
    } else if ( strcasecmp( e, "png" ) == 0 ) {
        return MIME_PNG;
    } else if ( strcasecmp( e, "json" ) == 0 ) {
        return MIME_JSON;
    } else if ( strcasecmp( e, "css" ) == 0 ) {
        return MIME_CSS;
    } else {                    /* "bin" is OCTET also! */
        return MIME_OCTET;
    }
}

/* static web server */
ssize_t sock_web( int sock, const char* path ) {
    ssize_t res;
    const char* file = "";
    size_t elen, plen, fullpath_len;
    int fd, index = 0;
    off_t flen;
    char exp[BUF_SIZE+1], *ext = NULL;
    const char* mime = NULL;
    const char* lQS = NULL;

    if ( path[0] == '/' ) { path++; } /* open relative to docroot */

    lQS = strchr( path, '?' );
    if ( lQS ) {
        // Note (maxw): added to support parameter passing to the console app (from our doc).
        strncpy( exp, path, lQS - path );
        exp[lQS - path] = 0;
        url_decode( exp, exp, 0 );
        path = exp;
        plen = strlen( path );
    } else {
        plen = strlen( path );
    }
    
    if ( path[0] == '\0' || path[plen-1] == '/' ) {
        index = 1;
        if ( !lQS ) { strncpy( exp, path, BUF_SIZE ); }
        file = "index.html";
    } else if ( fisdir( path ) ) {
        index = 1;
        if ( !lQS ) { strncpy( exp, path, BUF_SIZE ); }
        file = "/index.html";
    } else {
        // Note (maxw): added to support links in our doc (containing %20 characters etc.).
        if ( exp != path ) {
            strncpy( exp, path, BUF_SIZE );
        }
        url_decode( exp, exp, 0 );
        path = exp;
    }

    if ( index ) { 
        strncpy( exp+plen, file, BUF_SIZE-plen );
    }
    if ( docroot_len ) {
        fullpath_len = MIN( strlen(index ? exp : path), PATH_MAX-docroot_len );
        strncpy( docroot + docroot_len, index ? exp : path, fullpath_len+1 );
        docroot[docroot_len+fullpath_len] = '\0';
    }

    LOG_LINE( kLogInfo, "opening document %s", docroot_len ? docroot : (index ? exp : path) );
    fd = open( docroot_len ? docroot : (index ? exp : path), O_RDONLY );

    if ( fd < 0 ) {
	if ( errno == ENOENT ) {
	    elen = snprintf( exp, BUF_SIZE, "%d file %s%s not found: %s",
			     HTTP_NOT_FOUND, path, file, strerror(errno) );
	    return http_resp( sock, HTTP_NOT_FOUND, HTTP_NOT_FOUND_DESC, 
                              NULL, exp, 0 );
	} else {
	    elen = snprintf( exp, BUF_SIZE, 
                             "%d file access %s%s forbidden: %s",
			     HTTP_FORBID, path, file, strerror(errno) );
	    return http_resp( sock, HTTP_FORBID, HTTP_FORBID_DESC, 
                              NULL, exp, 0 );
	}
    }
    
    ext = strrchr( index ? exp : path, '.' ); if ( ext ) { ext++; }
    mime = mime_type( ext );
    flen = fdsize( fd );        /* limit to 2GB files for now */
    elen = snprintf( exp, BUF_SIZE, 
                     TYPE "%s" CRLF
                     LENGTH "%ld" CRLF, mime, (long int)flen );
    http_resp( sock, HTTP_OK, HTTP_OK_DESC, exp, NULL, 0 );
    res = afy_sendfile( sock, fd, NULL, flen );
    close( fd );
    if ( res < flen ) { return 0; }
    return res;
}

#define METHOD_GET 0
#define METHOD_POST 1

int parse_command( const char* cmd ) { 
    if ( strncmp( GET, cmd, strlen( GET ) ) == 0 ) {
	return METHOD_GET;
    } else if ( strncmp( POST, cmd, strlen( POST ) ) == 0 ) {
	return METHOD_POST;
    } 
    return -1;
}

void parse_frag( char* req, char** query, char** frag ) {
    *frag = req;
    *query = strsep( frag, "#" );	/* frag points to char after # */
}

const char* param_strs[] = {
    "p",
    "query",
    "expression",
    "input",
    "output",
    "iformat",
    "oformat",
    "offset",
    "limit",
    "type",
    "notifparam",
    "clientid",
    "timeout",
};

#define PARAMS (sizeof(param_strs)/sizeof(const char*))

#define ARG_QPARAM 0
#define ARG_QUERY 1
#define ARG_EXPRESSION 2
#define ARG_INPUT 3
#define ARG_OUTPUT 4
#define ARG_IFORMAT 5
#define ARG_OFORMAT 6
#define ARG_OFFSET 7
#define ARG_LIMIT 8
#define ARG_TYPE 9
#define ARG_NOTIFPARAM 10
#define ARG_CLIENTID 11
#define ARG_TIMEOUT 12

typedef struct cgi_params_s {
    char *query, *input, *output, *type, *notifparam, *clientid;
    int timeout;
} cgi_params_t;

#define INPUT_DEFAULT "pathsql"
#define OUTPUT_DEFAULT "json"

#define cgi_init( cgi ) do {                    \
        (cgi)->query = NULL;                    \
        (cgi)->input = INPUT_DEFAULT;           \
        (cgi)->output = OUTPUT_DEFAULT;         \
        (cgi)->type = NULL;                     \
        (cgi)->notifparam = NULL;               \
        (cgi)->clientid = NULL;                 \
        (cgi)->timeout = 0;                     \
    } while (0)

typedef struct page_params_s {
    unsigned off, lim; 
} page_params_t;

#define page_init( page ) \
    do { (page)->off = 0; (page)->lim = ~0u; } while (0)

#define QUERY_PARAMS_MAX 10

typedef struct query_params_s {
    char* params_static[QUERY_PARAMS_MAX];
    char** params;
    unsigned n, max;
    int alloced;
} query_params_t;

#define query_init( q ) do {                    \
        (q)->params = (q)->params_static;       \
        (q)->n = 0;                             \
        (q)->max = QUERY_PARAMS_MAX;            \
        (q)->alloced = 0;                       \
    } while (0)

int query_print( query_params_t* q, enum eLogLevel level ) {
    unsigned i;
    char* p;
    LOG_LINE( level, "params[%u] = [", q->n );
    for ( i = 0; i < q->n; i++ ) {
        p = q->params[i];
        if ( p ) { LOG_LINE( level, "  \"%s\"", p ); }
        else { LOG_LINE( level, "  -" ); }
    }
    LOG_LINE( level, "]" );
    return 1;
}

int query_add( query_params_t* q, unsigned i, const char* val ) {
    unsigned new_max;
    char** params = NULL;
    if ( i+1 > q->max ) {
        new_max = q->max+q->max/2;
        if ( q->alloced ) { 
            params = realloc( q->params, sizeof(char*) * new_max );
            if ( !params ) { return 0; }
        } else {
            params = malloc( sizeof(char*) * new_max );
            if ( !params ) { return 0; }
            memcpy( params, q->params, sizeof(char*) * q->n );
        }
        q->params = params;
    }
    if ( i+1 > q->n ) {
        memset( q->params + q->n, 0, sizeof(char*) * (i - q->n) );
        q->n = i+1;
    }
    q->params[i] = (char*)val;
    return 1;
}

#define query_free( q ) do {                                            \
        if ( (q)->alloced ) { free( (q)->params ); (q)->alloced = 0; }  \
    } while (0)

int parse_params( char* str, cgi_params_t* cgi, query_params_t* params,
                  page_params_t* page ) {
    size_t len;
    unsigned i, n;
    int find;
    unsigned off = 0, lim = ~0u;
    char *sp, *ap, *arg, *val = 0, *endp;
    for ( n = 0, sp = strsep( &str, "&" ); sp; sp = strsep( &str, "&" ) ) {
        ap = sp;
	arg = strsep( &ap, "=" );
        len = strcspn( arg, "0123456789" );
        if ( len > 0 ) {
            for ( find = -1, i = 0; find < 0 && i < PARAMS; i++ ) {
                if ( strncmp( arg, param_strs[i], len ) == 0 ) {
                    val = strsep( &ap, "=" );
                    if ( val ) { url_decode( val, val, 0 ); }
                    find = i;
                    n++;
                }
            }
            switch ( find ) {
            case ARG_QPARAM: 
                if ( params ) { 
                    query_add( params, atoi(arg+1), val ); 
                }
                break;
            case ARG_QUERY: if ( cgi ) { cgi->query = val; } break;
            case ARG_EXPRESSION: if ( cgi ) { cgi->query = val; } break;
            case ARG_INPUT:
            case ARG_IFORMAT: if ( cgi ) { cgi->input = val; } break;
            case ARG_OUTPUT:
            case ARG_OFORMAT: if ( cgi ) { cgi->output = val; } break;
            case ARG_TYPE: if ( cgi ) { cgi->type = val; } break;
            case ARG_OFFSET: 
                if ( page ) { 
                    errno = 0;
                    off = strtoul( val, &endp, 10 );
                    if ( errno == 0 && endp != val ) { page->off = off; }
                }
                break;
            case ARG_LIMIT: 
                if ( page ) { 
                    errno = 0;
                    lim = strtoul( val, &endp, 10 );
                    page->lim = (errno || endp == val) ? ~0u : lim;
                }
                break;
            case ARG_NOTIFPARAM: if ( cgi ) { cgi->notifparam = val; } break;
            case ARG_CLIENTID: if ( cgi ) { cgi->clientid = val; } break;
            case ARG_TIMEOUT: if ( cgi ) { cgi->timeout = atoi(val); } break;
            }
        }
    }
    return n;
}

ssize_t afy_read( afy_stream_t* ctx, void* in, size_t in_len ) {
    if ( !ctx || !in ) { return -2; }   /* internal error */
    if ( ctx->clen == 0 ) { return -1; } /* eof */
    if ( ctx->clen >= 0 ) { in_len = MIN( in_len, (size_t)ctx->clen ); }
    if ( ctx->len > 0 ) {
        if ( !ctx->buf ) { return -2; } /* internal error */
        in_len = MIN( in_len, (size_t)ctx->len );
        memcpy( in, ctx->buf, in_len );
        ctx->len -= in_len; ctx->clen -= in_len;
        ctx->buf = (char*)ctx->buf+in_len;
        return in_len;
    }
    if ( ctx->sock < 0 ) { return -1; }
        
    return recv( ctx->sock, in, in_len, 0 );
}

ssize_t afy_write( afy_stream_t* ctx, const void* out, size_t out_len ) {
    return sock_write( ctx->sock, out, out_len );
}

const char* alias[] = {
    "",
    AFYD_QUERY_ALIAS,
    AFYD_CREATE_ALIAS,
    AFYD_DROP_ALIAS
};

#define CGI_STATIC 0
#define CGI_QUERY 1
#define CGI_CREATE 2
#define CGI_DROP 3

int match_cgi( const char* sep, const char* path ) {
    if ( match_alias( AFYD_QUERY_ALIAS, sep, path ) ) {
        return CGI_QUERY;
    } else if ( match_alias( AFYD_CREATE_ALIAS, sep, path ) ) {
        return CGI_CREATE;
    } else if ( match_alias( AFYD_DROP_ALIAS, sep, path ) ) {
        return CGI_DROP;
    } else {
        return CGI_STATIC;
    }
}

typedef struct thread_arg_s {
    int sock;
    void* storemgr;
    int auto_create;
} thread_arg_t;

pthread_mutex_t thread_mutex;

pthread_mutex_t main_mutex;
void* external_db = NULL;

/* this thread structure is inefficient - needs to be improved */

#define THREAD_MAX 10000
pthread_t* thread = NULL;
pthread_t thread_main = 0;
int thread_max = 0, thread_size = 0, thread_start = 0;
volatile int thread_running = 0;

int thread_tracked( pthread_t th ) {
    int i;
    for ( i = 0; i <= thread_max; i++ ) {
        if ( thread[i] == th ) { return 1; }
    }
    return 0;
}

int thread_killall( pthread_t exclude, uint32_t usec ) {
    int i, target;
    uint32_t elapsed ;
    pthread_t self = pthread_self();
    pthread_t self_tracked;
    pthread_mutex_lock( &thread_mutex );
    self_tracked = thread_tracked( self ) ? self : 0;
    target = (exclude ? 1 : 0) + (self_tracked ? 1 : 0);
    intr = 1;
    for ( i = 0; i <= thread_max; i++ ) {
        if ( thread[i] && thread[i] != exclude && thread[i] != self_tracked ) {
            pthread_kill( thread[i], SIGUSR1 );
        }
    }
    pthread_mutex_unlock( &thread_mutex );

    elapsed = 0;
    LOG_LINE( kLogInfo, "thread_killall target = %d\n", target );
    for ( i = thread_running; thread_running > target && elapsed < usec ; ) {
        usleep( 10 );
        elapsed += 10;
        if ( thread_running < i ) {
            i = thread_running;
            LOG_LINE( kLogInfo, "threads left = %d\n", i );
        }
    }
    LOG_LINE( kLogInfo, "done left = %d\n", i );

    intr = 0;

    return thread_running <= target ? 1 : 0;
}

int thread_cancelall( pthread_t exclude ) {
    int i;
    pthread_t self = pthread_self();
    pthread_t self_tracked;
    pthread_mutex_lock( &thread_mutex );
    self_tracked = thread_tracked( self ) ? self : 0;
    
    for ( i = 0; i <= thread_max; i++ ) {
        if ( thread[i] && thread[i] != exclude && thread[i] != self_tracked ) {
            pthread_cancel( thread[i] );
        }
    }
    pthread_mutex_unlock( &thread_mutex );
    return 1;
}

int thread_init( int n ) {
    int ret;
    thread = (pthread_t*)malloc( sizeof(pthread_t) * n );
    if ( thread == NULL ) { ret = 0; goto unlock; }
    memset( thread, 0, sizeof(pthread_t) * n );
    thread_size = n;
    thread_main = pthread_self();
    thread[0] = thread_main;
    thread_max = 0;
    thread_running = 1;
    pthread_mutex_init( &thread_mutex, NULL );
    pthread_mutex_init( &main_mutex, NULL );
    ret = 1;
unlock:
    return ret;
}

int thread_close( void ) {
    pthread_mutex_destroy( &main_mutex );
    pthread_mutex_destroy( &thread_mutex );
    return 1;
}

int thread_grow( int by ) {
    pthread_t* grow;
    grow = (pthread_t*)realloc( thread, sizeof(pthread_t) * (thread_size+by) );
    if ( grow == NULL ) { return 0; }
    memset( thread+thread_size, 0, sizeof(pthread_t) * by );
    thread_size += by;
    return 1;
}

int thread_add( pthread_t th ) {      /* self-record ID */
    int  i, ret;
    pthread_mutex_lock( &thread_mutex );
    if ( thread_running >= thread_size ) {
        if ( !thread_grow( thread_size/2 ) ) { ret = 0; goto unlock; }
    }
    for ( i = thread_start; i < thread_size; i++ ) {
        if ( thread[i] == 0 ) {
            thread[i] = th;
            thread_start = i+1;
            thread_running++;
            if ( i > thread_max ) { thread_max = i; }
            break;
        }
    }
    ret = 1;
unlock:
    pthread_mutex_unlock( &thread_mutex );
    return ret;
}

int thread_delete( pthread_t th ) {
    int i, deleted;
    pthread_mutex_lock( &thread_mutex );
    for ( i = 0, deleted = 0; i <= thread_max; i++ ) {
        if ( thread[i] == th ) { 
            if ( i == thread_max ) { thread_max--; }
            if ( i < thread_start ) { thread_start = i; }
            thread[i] = 0; 
            thread_running--;
            deleted = 1;
            break;
        }
    }
    pthread_mutex_unlock( &thread_mutex );
    return deleted;
}

int sock_cgi( int sock, int method, int action, char* path, char* body, 
              int blen, int bsz, int clen, void* storemgr, int auto_create,
              afy_connection_ctx_t** cctxp, char* req, 
              const char* user, const char* pass ) {
    char *query = NULL, *frag = NULL, *buf = NULL;
    char exp[BUF_SIZE+1];
    int elen = 0, isclose = 0, alloc = 0;
    afy_stream_t ctx;
    cgi_params_t cgi;
    query_params_t qparams;
    page_params_t page;
#ifdef AFFINITY_LINK
    int rc;
    ssize_t rd;
    char* res = NULL;
    void *val = NULL;
    size_t ret;
    uint64_t count;
    char numstr[20+1];

    numstr[0] = '\0';
    cgi_init( &cgi );
    query_init( &qparams );
    page_init( &page );
    LOG_LINE( kLogInfo, "raw: %s", req );
    parse_frag( req, &query, &frag );
    LOG_LINE( kLogDebug, "path: %s, query: %s, frag: %s", 
              path?path:"", query?query:"", frag?frag:"" );
    parse_params( query, &cgi, &qparams, &page );
    LOG_LINE( kLogDebug, "query: %s, input: %s, output: %s, type: %s", 
              cgi.query?cgi.query:"", cgi.input, cgi.output,
              cgi.type?cgi.type:"query");
    query_print( &qparams, kLogDebug );
    LOG_LINE( kLogInfo, "page off=%u", page.off );
    if ( page.lim != ~0u ) {
        LOG_LINE( kLogInfo, "page limit=%u\n", page.lim );
    }
 
    if ( action == CGI_DROP ) {
        if ( external_db ) { // REVIEW: With multi-store this has become a way too coarse test; but mvengine is a secondary matter at the moment.
            http_resp( sock, HTTP_INT, "can not DROP afyengine store",
                       TYPE MIME_HTML CRLF, 
                       "can not DROP mveninge managed store", 0 );
            return 0;
        }
        pthread_mutex_lock( &main_mutex );
        #if 1
            if ( *cctxp ) { afy_term_connection( *cctxp ); *cctxp = NULL; }
            rc = 0 == afy_drop_store( storemgr, user, pass );
        #else
            // NOTE (maxw): With multi-store this drastic approach is no longer applicable...
            // REVIEW (maxw): If drop is called say at startup, after unclean shutdown, this code doesn't delete the logs...
            if ( !thread_killall( thread_main, 1000000 ) ) { /* 1 sec */
                /* not at all safe... */
                /* thread_cancelall( thread_main ); */
            }
            afy_close( sess );
            afy_term( main_db );
            main_db = NULL;
            elen = MIN( strlen(storedir), BUF_SIZE - 1 - strlen("affinity.db")-1 );
            strncpy( exp, storedir, elen+1 );
            if ( elen > 0 && exp[elen-1] != '/' ) { exp[elen++] = '/'; }
            strcpy( exp+elen, "affinity.db" );
            if ( afyd_verbose ) { 
                LOG_LINE( kLogInfo, "dropping store \"%s\"", exp );
            }
            rc = unlink( exp ) == 0;
        #endif
        http_resp( sock, rc ? HTTP_OK : HTTP_INT,
                   rc ? HTTP_OK_DESC : "drop error",
                   TYPE MIME_HTML CRLF,
                   rc ? "drop succeeded" : "drop failed", 0 );
        pthread_mutex_unlock( &main_mutex );
        return 1;
    }

    /* if the client switches stores within a single connection, deal with it */
    /* REVIEW: we could also decide to not allow this */
    if ( *cctxp != NULL && user != NULL && 0 != strcmp( user, ( *cctxp )->storeident ) ) {
        afy_term_connection( *cctxp );
        *cctxp = NULL;
    }

    /* auto-open if no previous requests opened */
    if ( *cctxp == NULL ) {
        *cctxp = afy_init_connection( storemgr, user, pass );
    }
    if ( *cctxp == NULL ) {
        LOG_LINE( kLogWarning, "db request, but db not AVAILABLE" );
        http_resp( sock, HTTP_INT, "missing store", TYPE MIME_HTML CRLF,
                   "missing store, must CREATE first", 0 );
        return 0;
    }
    if ( action == CGI_CREATE ) {
        http_resp( sock, HTTP_OK, HTTP_OK_DESC,
                   TYPE MIME_HTML CRLF, "create succeeded", 0 );
        return 1;
    }

    if ( method == METHOD_GET ) {
        if ( strcmp( cgi.input, "proto" ) == 0 ) {
            /* unsupported */
            http_resp( sock, HTTP_INT, HTTP_INT_DESC, NULL,
                       "GET with input=proto unsupported\n", 0 );
            return 1;
        } 
        if ( strcmp( cgi.input, "regnotif" ) == 0 ) {
            if ( cgi.type && 
                 ( strcmp( cgi.type, "class" ) == 0 || 
                   strcmp( cgi.type, "pin" ) == 0 ) ) {
                rc = afy_regNotif( *cctxp, cgi.type, 
                                   cgi.notifparam, cgi.clientid, &res );
                http_resp( sock, rc ? HTTP_OK : HTTP_INT, 
                           rc ? HTTP_OK_DESC : "affinity error", 
                           TYPE MIME_HTML CRLF, res, 0 );
                return 1;
            }
            /* unsupported */
            elen = snprintf( exp, BUF_SIZE, 
                             "unrecognized type for regnotif: %s\n", 
                             cgi.type );
            http_resp( sock, HTTP_INT, HTTP_INT_DESC, NULL, exp, 0 );
            return 1;
        }
        if ( strcmp( cgi.input, "unregnotif" ) == 0 ) {
            rc = afy_unregNotif( *cctxp, 
                                 cgi.notifparam, cgi.clientid, &res );
            http_resp( sock, rc ? HTTP_OK : HTTP_INT, 
                       rc ? HTTP_OK_DESC : "affinity error", 
                       TYPE MIME_HTML CRLF, res, 0 );
            return 1;
        }
        if ( strcmp( cgi.input, "waitnotif" ) == 0 ) {
            rc = afy_waitNotif( *cctxp, cgi.notifparam, 
                                cgi.clientid, cgi.timeout, &res );
            http_resp( sock, rc ? HTTP_OK : HTTP_INT, 
                       rc ? HTTP_OK_DESC : "affinity error", 
                       TYPE MIME_HTML CRLF, res, 0 );
            return 1;
        }
        if ( strcmp( cgi.input, "pathsql" ) != 0 ) {
            elen = snprintf( exp, BUF_SIZE, 
                             "unrecognized input format: %s\n", cgi.input );
            http_resp( sock, HTTP_INT, HTTP_INT_DESC, NULL, exp, 0 );
            return 1;
        }
        if ( !cgi.query ) {
            http_resp( sock, HTTP_INT, HTTP_INT_DESC, NULL,
                       "GET with no query argument\n", 0 );
            return 1;
        }

        if ( strcmp( cgi.output, "json" ) == 0 ) {
            if ( cgi.type && strcmp( cgi.type, "count" ) == 0 ) {
                rc = afy_sql2count( *cctxp, cgi.query, &res, NULL,
                                    qparams.params, qparams.n, &count );
                if ( rc ) { sprintf( numstr, "%llu", count ); }
            } else if ( cgi.type && strcmp( cgi.type, "plan" ) == 0 ) {
                rc = afy_sql2plan( *cctxp, cgi.query, &res,
                                   qparams.params, qparams.n );
            } else if ( cgi.type && strcmp( cgi.type, "display" ) == 0 ) {
                rc = afy_sql2display( *cctxp, cgi.query, &res );
            } else if ( cgi.type && strcmp( cgi.type, "expression" ) == 0 ) {
                rc = afy_expr2json( *cctxp, cgi.query, &res, NULL,
                                    qparams.params, qparams.n, &val );
                if ( val ) { res = (char*)afy_val2str( val ); }
            } else if ( !cgi.type || strcmp( cgi.type, "query" ) == 0 ) {
                rc = afy_sql2json( *cctxp, cgi.query, &res, NULL, 
                                   qparams.params, qparams.n,
                                   page.off, page.lim );
            } else {
                elen = snprintf( exp, BUF_SIZE,
                                 "invalid query type: \"%s\"\n", 
                                 cgi.type );
                http_resp( sock, HTTP_INT, "invalid query type",
                           CONNECTION CLOSE CRLF, exp, 0 );
                return 0;
            }
            query_free( &qparams );
            http_resp( sock, rc ? HTTP_OK : HTTP_INT, 
                       rc ? HTTP_OK_DESC : "affinity error", 
                       rc && ( !cgi.type || strcmp( cgi.type, "query" )==0 ) ? 
                       TYPE MIME_JSON CRLF : TYPE MIME_HTML CRLF,
                       numstr[0] ? numstr : (res?res:""), 0 );
            if ( res && !val ) { afy_sesfree( *cctxp, res ); }
            if ( val ) { afy_sesfreev( *cctxp, val ); }
            return 1;
        } else if ( strcmp( cgi.output, "proto" ) == 0 ) {
            ctx.sock = sock;
#ifdef STREAM_CLOSE
            http_resp( sock, HTTP_OK, HTTP_OK_DESC, 
                       CONNECTION CLOSE CRLF
                       TYPE MIME_PROTO CRLF, NULL );
#endif
            rd = afy_sql2raw( *cctxp, cgi.query, &res, &ctx, 
                              &afy_write, qparams.params, qparams.n, 
                              page.off, page.lim );
            query_free( &qparams );
#ifndef STREAM_CLOSE
            if ( rd < 0 ) {
                http_resp( sock, HTTP_INT, "query failed",
                           TYPE MIME_HTML CRLF,
                           "query failed", 0 );
            } else {
                http_resp( sock, HTTP_OK, HTTP_OK_DESC,
                           TYPE MIME_PROTO CRLF,
                           res ? res : "", rd );
            }
            afy_sesfree( *cctxp, res );
            return 1;
#else
            return 0;
#endif
        } else {
            elen = snprintf( exp, BUF_SIZE, 
                             "unrecognized output format: %s\n", cgi.output );
            http_resp( sock, HTTP_INT, HTTP_INT_DESC, NULL, exp, 0 );
            return 1;
        }
    } else if ( method == METHOD_POST ) { 
        /* if the input is pathsql we have to read it all into a string */
	if ( strcmp( cgi.input, "pathsql" ) == 0 ) {
            if ( clen < 0 ) {
                isclose = 1;
                buf = malloc( MAX_POST+1 ); 
                if ( !buf ) {
                    http_resp( sock, HTTP_UNAVAIL, HTTP_UNAVAIL_DESC, 
                               NULL, "out of memory\n", 0 );
                    return 0;
                }
                alloc = 1;
                if ( blen > MAX_POST ) {
                    http_resp( sock, HTTP_INT, HTTP_INT_DESC, NULL, 
                               "assert\n", 0 );
                }
                memcpy( buf, body, blen );
                body = buf;
                rd = sock_read( sock, body+blen, MAX_POST-blen );
                if ( rd < 0 ) {
                    http_resp( sock, HTTP_BAD, HTTP_BAD_DESC, NULL,
                               "read error on POST\n", 0 );
                    if ( alloc ) { free( body ); }
                    return 0;
                }
                clen = blen + rd;
                if ( clen >= bsz-blen ) {
                    /* @@ 1MB is hardcoded to match MAX_POST */
		    http_resp( sock, HTTP_LARGE, HTTP_LARGE_DESC, NULL, 
                               "http POST too large > 1MB\n", 0 );
                    if ( alloc ) { free( body ); }
                    return 0;
                }
            } else if ( blen < clen ) { /* need to read more */
                /* if there is enough space, but it in the callers buffer */
		if ( clen-blen > bsz-blen ) {
		    buf = malloc( clen+1 ); 
                    if ( !buf ) {
                        http_resp( sock, HTTP_UNAVAIL, HTTP_UNAVAIL_DESC, 
                                   NULL, "out of memory\n", 0 );
                        return 0;
                    }
                    alloc = 1;
		    memcpy( buf, body, blen ); /* copy what we have */
                    body = buf;
		}
                rd = sock_read( sock, body+blen, clen-blen );
                if ( rd < clen-blen ) {
                    http_resp( sock, HTTP_BAD, HTTP_BAD_DESC, NULL,
                               "data received less than content-length", 0 );
                    if ( alloc ) { free( body ); }
                    return 0;
                }
	    }
            body[clen] = '\0';
            if ( afyd_verbose > 1 ) {
                LOG_LINE( kLogInfo, "request post: %s", body );
            }
	    parse_params( body, &cgi, &qparams, &page );
            query_print( &qparams, kLogDebug );

            if ( !cgi.query ) {
                http_resp( sock, HTTP_INT, HTTP_INT_DESC, NULL,
                           "missing query param\n", 0 );
                if ( alloc ) { free( body ); }
                return 0;
            }
            if ( strcmp( cgi.output, "json" ) == 0 || 
                 (cgi.type && strcmp( cgi.type, "query" ) != 0) ) {
                if ( cgi.type && strcmp( cgi.type, "count" ) == 0 ) {
                    rc = afy_sql2count( *cctxp, cgi.query, &res,NULL,
                                        qparams.params, qparams.n, &count );
                    if ( rc ) { sprintf( numstr, "%llu", count ); }
                } else if ( cgi.type && strcmp( cgi.type, "plan" ) == 0 ) {
                    rc = afy_sql2plan( *cctxp, cgi.query, &res,
                                       qparams.params, qparams.n );
                } else if ( cgi.type && strcmp( cgi.type, "display" ) == 0 ) {
                    rc = afy_sql2display( *cctxp, cgi.query, &res );
                } else if ( cgi.type && strcmp( cgi.type, "expression" )==0 ) {
                    rc = afy_expr2json( *cctxp, cgi.query, &res, NULL,
                                        qparams.params, qparams.n, &val );
                    if ( val ) { res = (char*)afy_val2str( val ); }
                } else if ( !cgi.type || strcmp( cgi.type, "query" ) == 0 ) {
                    rc = afy_sql2json( *cctxp, cgi.query, &res,NULL, 
                                       qparams.params, qparams.n,
                                       page.off, page.lim );
                } else {
                    elen = snprintf( exp, BUF_SIZE,
                                     "invalid query type: \"%s\"\n", 
                                     cgi.type );
                    http_resp( sock, HTTP_INT, "invalid query type",
                               CONNECTION CLOSE CRLF, exp, 0 );
                    return 0;
                }
                query_free( &qparams );
                ret = http_resp( sock, rc ? HTTP_OK : HTTP_INT, 
                                 rc ? HTTP_OK_DESC : "affinity error", 
                                 rc && 
                                 ( !cgi.type||strcmp(cgi.type,"query")==0 ) ?
                                 TYPE MIME_JSON CRLF : TYPE MIME_HTML CRLF,
                                 isclose ? NULL : (numstr[0] ? numstr : 
                                                   (res?res:"")), 0 );
                if ( ret && isclose ) {
                    ret = sock_write( sock, 
                                      numstr[0] ? numstr : (res?res:""),
                                      strlen( numstr[0] ? numstr : 
                                              (res?res:"") ) );
                }
                if ( res && !val ) { afy_sesfree( *cctxp, res ); }
                if ( val ) { afy_sesfreev( *cctxp, val ); }
                if ( alloc ) { free( body ); }
                return isclose ? 0 : ret;
            } else if ( strcmp( cgi.output, "proto" ) == 0 ) {
                ctx.sock = sock;
#ifdef STREAM_CLOSE
                http_resp( sock, HTTP_OK, HTTP_OK_DESC, 
                           CONNECTION CLOSE CRLF
                           TYPE MIME_PROTO CRLF, NULL );
#endif
                rd = afy_sql2raw( *cctxp, cgi.query, &res, &ctx, 
                                  &afy_write, qparams.params, qparams.n,
                                  page.off, page.lim );
                if ( alloc ) { free( body ); }
#ifndef STREAM_CLOSE
                if ( rd < 0 ) {
                    http_resp( sock, HTTP_INT, "query failed",
                               TYPE MIME_HTML CRLF,
                               "query failed", 0 );
                } else {
                    http_resp( sock, HTTP_OK, HTTP_OK_DESC,
                               TYPE MIME_PROTO CRLF,
                               res ? res : "", rd );
                }
                afy_sesfree( *cctxp, res );
                return 1;
#else
                return 0;
#endif
            }
	} else if ( strcmp( cgi.input, "proto" ) == 0 ) {
            if ( strcmp( cgi.output, "proto" ) == 0 ) {
                ctx.sock = sock;
                ctx.buf = body;
                ctx.len = blen;
                ctx.clen = clen;
                http_resp( sock, HTTP_OK, HTTP_OK_DESC, CONNECTION CLOSE CRLF, NULL, 0 );
                afy_raw2raw( *cctxp, &ctx, &afy_read, &afy_write );
                return 0;
            } else if ( strcmp( cgi.output, "json" ) == 0 ) {
                /* unsupported */
            }
        }
    } else {
	LOG_LINE( kLogError, "invalid command, internal error" );
    }
#else
    sock_write( sock, HELLO, strlen( HELLO ) );
#endif
    return 1;
}

int alpha[256] = {
    -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,62,-1,-1,-1,63,
    52,53,54,55,56,57,58,59,60,61,-1,-1,-1,0,-1,-1,
    -1,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,
    15,16,17,18,19,20,21,22,23,24,25,-1,-1,-1,-1,-1,
    -1,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,
    41,42,43,44,45,46,47,48,49,50,51,-1,-1,-1,-1,-1,
    -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
};

int auth_extract( char* auth, char** user, char** pass ) {
    int alen, slen, i, j;
    char* res = NULL, *ptr = NULL;
    if ( !user || !pass || !auth ) { return 0; } /* internal error, really */
    
    alen = (int)strlen(auth);
    for ( i = 0, j = 0; i < alen; i++ ) { /* strip non b64 chars in-place */
	if ( alpha[(int)auth[i]] >= 0 ) {
	    auth[j] = auth[i];
	    j++;
	}
    }
    alen = j;
    slen = alen/4;
    if ( slen*4 != alen ) { return 0; } /* not a multiple of 4 */
    
    /* convert in place */
    /* abcd -> 123 */
    for ( i = 0, res = auth, ptr = auth; i < slen; i++, ptr += 4, res += 3 ) {
	res[0] = alpha[(int)ptr[0]]<<2|alpha[(int)ptr[1]]>>4; /* 6+2 */
	res[1] = alpha[(int)ptr[1]]<<4|alpha[(int)ptr[2]]>>2; /* 4+4 */
	res[2] = alpha[(int)ptr[2]]<<6|alpha[(int)ptr[3]];	  /* 2+6 */
    }
    auth[slen*3] = '\0';
    
    *user = auth;
    *pass = strchr( *user, ':' );
    if ( !*pass ) { return 0; }
    **pass = '\0';
    (*pass)++;
    return 1;
}

ssize_t sock_server( int client, void* storemgr, int auto_create, afy_connection_ctx_t** cctxp ) {
    int res, rlen, elen, blen = 0, cmd, clen = -1, cgi = 0;
    char req[BUF_SIZE+1], exp[BUF_SIZE+1];
    char *body = NULL, *path = NULL, *space = NULL, *headers = NULL;
    char *auth = NULL, *method = NULL, *user = NULL, *pass = NULL;
    char *pend = NULL, pold, *aend = NULL, aold, *mend = NULL, mold;
    char *vers = NULL, *vend = NULL, *end = NULL, *end2 = NULL, undo;
    char *content_len = NULL, *query = NULL;

    strncpy( exp, "Internal Error\n", BUF_SIZE ); /* just in case! */

    /* can return less than full request, but in practice typically not
       technically, it depends on the client and NAGLE algo, but web
       clients, for performance reasons try to send in one shot */
    
    for ( res = 1, rlen = 0, body = NULL; 
          res > 0 && !body && rlen < BUF_SIZE; 
          rlen += res) {
        res = recv( client, req+rlen, BUF_SIZE-rlen, 0 );
        if ( res > 0 ) {
            req[rlen+res] = '\0';
            body = strstr( req, CRLF CRLF );    /* find request boundary */
        }
    }

    if ( !body ) {
        if ( rlen >= BUF_SIZE ) {
            http_resp( client, HTTP_LARGE, HTTP_LARGE_DESC, NULL, 
                       "http request header > 16KB unsupported", 0 );
        }
        return 0;
    }

    /* skip \r\n\r\n */
    body += 2;                  /* keep \r\n for last header! */
    *body = '\0';		/* end of header marker */
    body += 2; 
    blen = rlen - (int)(body - req);

    /* parse request line comments show ^ for parsing stage */
    space = strchr( req, ' ' );	/* GET^/path HTTP/1.1 */
    if ( space ) { 
	*space = '\0'; 
    } else {
	http_resp( client, HTTP_INT, HTTP_INT_DESC, NULL, exp, 0 );
	return 0;
    }
    cmd = parse_command( req );
    if ( cmd < 0 ) {
	elen = snprintf( exp, BUF_SIZE, 
			 "unsupported HTTP command: %s\n", req );
	http_resp( client, HTTP_UNIMPL, HTTP_UNIMPL_DESC, NULL, exp, 0 );
	*space = ' ';		/* undo edit? */
	return 0;
    }

    path = space+1;		/* GET /path^HTTP/1.1 */
    pend = strpbrk( path, " " );
    if ( !pend ) { 
	http_resp( client, HTTP_INT, HTTP_INT_DESC, NULL, exp, 0 );
	return 0;
    }

    pold = *pend; *pend = '\0';
    vers = pend+1;              /* audit this line: eg buf init to 0? */
    vend = strpbrk( vers, CRLF );
    if ( vend ) {
        headers = vend;         /* preserve the CRLF before headers */
    } else {
        headers = vers+strlen(vers); /* audit: an editable empty string */
    }
  
    cgi = match_cgi( CGI_SEP, path );

    /* if not matching /db/ path alias, serve via static web server */
    if ( !cgi ) {
        if ( !www_service ) { 
	    http_resp( client, HTTP_FORBID, HTTP_FORBID_DESC, NULL, 
                       "no static web service as docroot unspecified\n", 0 );
            return 0;
        }
        LOG_LINE( kLogReport, "static request: %s", path );
        res = sock_web( client, path ); /* static web server */
        return res;
    } else {
        LOG_LINE( kLogReport, "db request: %s %s", req, path );
        if ( afyd_verbose ) {
            LOG_LINE( kLogInfo, "request headers: %s", headers );
        }

	clen = -1;    /* POST uses Content-Length header if present */
	if ( cmd == METHOD_POST ) {
            content_len = http_parse( headers, CRLF LENGTH,strlen(CRLF LENGTH),
                                      &undo, &end );
            if ( content_len ) {
                clen = strtol( content_len, &end2, 10 );
                if ( end != end2 || end2 == content_len ) {
		    http_resp( client, HTTP_INT, HTTP_INT_DESC, NULL, exp, 0 );
		    return 0;
                }
		if ( clen > MAX_POST ) {
		    http_resp( client, HTTP_LARGE, HTTP_LARGE_DESC, NULL, 
                               "http POST too large > 1MB\n", 0 );
		    return 0;
		}
                undo_parse( undo, end );
            }
	}

        /* parse auth header if present  */
	auth = strstr( headers, CRLF AUTH );
        if ( auth ) {
            auth += strlen(CRLF AUTH); /* Authorization: ^ */
            method = auth;
            mend = strpbrk( auth, " " CRLF ); /* Authorization: <method>^ */
            if ( !mend ) {
                http_resp( client, HTTP_UNAUTH, HTTP_UNAUTH_DESC, 
                           WWW_AUTH BASIC CRLF, "invalid auth", 0 );
                return 0;
            }
            mold = *mend; *mend = '\0';
            if ( strncasecmp( method, BASIC, strlen(BASIC) ) != 0 ) {
                http_resp( client, HTTP_UNAUTH, HTTP_UNAUTH_DESC, 
                           WWW_AUTH BASIC CRLF, 
                           "unsupported auth method, only " BASIC 
                           " supported", 0 );
                return 0;
            }
	
            auth = mend+1;
            aend = strpbrk( auth, " " CRLF ); /* Authorization: <method>^ */
            if ( aend ) { aold = *aend; *aend = '\0'; }
            if ( !aend || !auth_extract( auth, &user, &pass ) ) {
                http_resp( client, HTTP_UNAUTH, HTTP_UNAUTH_DESC, 
                           WWW_AUTH BASIC CRLF, "malformed user/pass", 0 );
                return 0;
            }
        }
	
#if 0
        /* temporarily disable this until we have auth support in afyclient */
        /* auth is mandatory for CGI_CREATE & CGI_DROP */
	if ( !auth && ( cgi == CGI_CREATE || cgi == CGI_DROP ) ) { 
	    http_resp( client, HTTP_UNAUTH, HTTP_UNAUTH_DESC, 
                       WWW_AUTH BASIC CRLF, NULL, 0 );
	    return 0;
	}
#endif

	/* dont undo auth edits its more complex so do it last */
	/* *mend = mold; *aend = aold; */ 

	/* no HTTP Keep-Alive for now */

        query = path + strlen( alias[cgi] );
        query += strspn( query, CGI_SEP ); /* skip "/?" chars */
        if ( intr ) { return 0; }
	return sock_cgi( client, cmd, cgi, path, 
                         body, blen, BUF_SIZE-(int)(body-req), 
                         clen, storemgr, auto_create, cctxp, query, user, pass );
    }
}

void* thread_container( void* arg ) {
    thread_arg_t* tctx;
    afy_connection_ctx_t* cctx = NULL;
    pthread_t me = pthread_self();

    if ( !arg ) { return NULL; }
    thread_add( me );

    tctx = (thread_arg_t*)arg;
    do {} 
    while ( !intr && 
            sock_server( tctx->sock, tctx->storemgr, tctx->auto_create, &cctx ) );
    sock_close( tctx->sock );
    if ( cctx ) { afy_term_connection( cctx ); }
    free( arg );

    thread_delete( me );
    pthread_detach( me );
    return NULL;			/* exit thread */
}

int storedir_alloc;

int validate_dir( const char* dir, const char* desc ) {
    size_t dlen = strlen(dir);
    if ( (dlen > 0 && dir[dlen-1] == PATH_SEP) || fisdir( dir ) ) {
        return 1;
    } else {
        LOG_LINE( kLogWarning, "%s \"%s\" is not a dir", 
                  desc, dir );
        return 0;
    }
}

const char* abs_dir( const char* dir, const char* curdir ) {
    size_t curdir_len;
    char* res = NULL;

    curdir_len = strlen(curdir);
    res = (char*)malloc( strlen(curdir) + 1 + strlen(dir) + 1 );
    if ( res == NULL ) { return NULL; }
    strcpy( res, curdir );
    /* join with '/' if neccessary */
    if ( curdir_len && res[curdir_len-1] != PATH_SEP ) { 
        res[curdir_len++] = PATH_SEP;
        res[curdir_len] = '\0';
    }
    strcpy( res+curdir_len, dir );
    curdir_len += strlen(dir);
     /* cop off trailing '/' */
    if ( curdir_len && res[curdir_len-1] == PATH_SEP ) {
        res[--curdir_len] = '\0';
    }

    return res;
}

int afydaemon_stop( uint32_t usec ) {
    if ( !thread_killall( 0, usec ) ) {
        thread_cancelall( 0 );
        return 0;
    }
    return 1;
}

#ifndef WIN32
void afySigPipeHandler(int sig, siginfo_t *info, void *uap) {}
#endif
void setSigPipeHandler()
{
#ifndef WIN32
    // Note (maxw):
    //   As far as I understand, SIGPIPE signals are probable, unavoidable, and undesirable in a multi-threaded server.
    struct sigaction lSA; memset(&lSA, 0, sizeof(lSA));
    lSA.sa_flags = SA_SIGINFO | SA_RESTART;
    sigemptyset(&lSA.sa_mask);
    lSA.sa_sigaction = afySigPipeHandler;
    if (0 != sigaction(SIGPIPE, &lSA, NULL))
        { fprintf(stderr, "Couldn't register signal for SIGPIPE!\n"); }
#endif
}

int afydaemon( void *ctx, const char* www, const char* store, 
              uint16_t port, int verbose, int auto_create ) {
    int list;
    int elen, res, www_alloc = 0;
    size_t dlen;
    char exp[BUF_SIZE+1], *envdir = NULL, *curdir = NULL;
    const char *wwwdir = NULL;
    int client;
    pthread_t child;
    thread_arg_t* arg = NULL;
    void* storemgr = NULL;

    loggingInit();
    external_db = ctx;

    /* if called from afyengine, start with a different server string */
    if ( ctx ) {
        dlen = MIN( strlen( AFYD_ENGINE ), AFYD_NAME_MAX );
        strncpy( AFYD_NAME, AFYD_ENGINE, dlen );
        AFYD_NAME[dlen] = '\0';
    }

    docroot[0] = '\0';
    afyd_verbose = verbose;

    if ( port == 0 ) { port = AFYD_PORT; }
    
    curdir = getcwd( exp, BUF_SIZE );
    if ( curdir == NULL ) {
        LOG_LINE( kLogWarning, "can't determine current dir" );
        return 0;
    }

    LOG_LINE( kLogReport, "starting with current dir \"%s\"", curdir );
    storedir = store;

    /* ok intention here:
     * 
     * 1. if storedir given but no www given try storedir/www/
     * 2a. if no wwwdir given, default to current dir
     *  b.  then if also no storedir given default to wwwdir/..
     *  c.  or if relative storedir given use relative to curdir
     * 3a. if wwwdir given, use it and
     *  b. then if no storedir given default to wwwdir/..
     *  c. or if relative storedir given use relative to wwwdir
     *
     * and wwwdir can be given via arg, and overridden by envvar $DOCROOT
     * and defaults to current dir
     */

    envdir = getenv( "DOCROOT" );
    if ( envdir ) { www = envdir; } /* override with $DOCROOT */
    wwwdir = www;
    if ( !wwwdir ) { wwwdir = "."; } /* 2a. no wwwdir, default curdir */
    www_service = 0;
    /* 1. !storedir, try storedir/www/ */
    if ( storedir && !www ) { wwwdir = "www"; } 
    if ( wwwdir ) {
        if ( !ABS_PATH( wwwdir ) ) { 
            wwwdir = abs_dir( wwwdir, curdir ); 
            if ( wwwdir == NULL ) {
                LOG_LINE( kLogError, "out of memory" ); 
                return 0;
            }
            www_alloc = 1; 
        }
        www_service = validate_dir( wwwdir, "docroot" );

        if ( www_service ) {    /* in afydaemon use abs path */
            if ( ctx ) {        /* as cannot chdir  */
                docroot_len = MIN( strlen( wwwdir ), PATH_MAX );
                strncpy( docroot, wwwdir, docroot_len+1 );
                docroot[docroot_len] = '\0';
                if ( docroot_len && docroot[docroot_len-1] != PATH_SEP ) {
                    docroot[docroot_len++] = PATH_SEP;
                    docroot[docroot_len] = '\0';
                }
                LOG_LINE( kLogReport, "started with docroot \"%s\"", docroot );
            } else {            /* in affinityd use relative path */
                res = chdir( wwwdir );
                if ( res < 0 ) {
                    LOG_LINE( kLogWarning, "can't open docroot \"%s\"", wwwdir );
                    www_service = 0;
                } else {
                    LOG_LINE( kLogReport, "started with docroot \"%s\"", wwwdir );
                }
            }
        }
    }
    if ( !www_service ) {
        LOG_LINE( kLogWarning, "static web service disabled" );
    }

    if ( storedir == NULL ) { 
        storedir = ".."; 
        LOG_LINE( kLogReport, "storedir defaulting to wwwdir%c..", PATH_SEP );
    }
    if ( !ABS_PATH( storedir ) ) { 
        storedir = abs_dir( storedir, store ? curdir : wwwdir );
        if ( storedir == NULL ) {
            LOG_LINE( kLogError, "out of memory" ); 
            if ( www_alloc ) { free( (void*)wwwdir ); www_alloc = 0; }
            return 0;
        }
        storedir_alloc = 1;
    } 

    if ( www_alloc ) { free( (void*)wwwdir ); www_alloc = 0; }

    if ( !validate_dir( storedir, "storedir" ) ) {
        if ( storedir_alloc ) { free( (void*)storedir ); }
        return 0;
    }
    
    LOG_LINE( kLogReport, "started with storedir \"%s\"", storedir );

    setSigPipeHandler();

    sock_init();
    list = sock_listener( port );

    intr_hook( 0 );
    thread_init( THREAD_MAX );
    
    storemgr = afy_init( ctx );
    
    while ( 1 ) {
        pthread_mutex_lock( &main_mutex ); /* barrier stop accepting */
        pthread_mutex_unlock( &main_mutex ); /* connections until done */
	/* wait for next client */
	client = accept( list, NULL, NULL );
        if ( client < 0 ) { continue; }
	
	arg = (thread_arg_t*)malloc( sizeof(thread_arg_t) );
	if ( !arg ) { 
	    LOG_LINE( kLogError, "out of memory" ); 
            return 0;
	}
	arg->storemgr = storemgr;
	arg->sock = client;
        arg->auto_create = auto_create;
	/* no thread pooling, create/exit on each request (or keep-alive connection) */
	/* Note: the assumed, correct usage of keep-alive connections is dedicated to 1 store/identity - we should verify/assert this... */
	res = pthread_create( &child, NULL, thread_container, (void*)arg );
	if ( res != 0 ) {
	    elen = snprintf( exp, BUF_SIZE, "pthread_create failed: %s", 
			     strerror(errno) );
	    /* overloaded? */
	    http_resp( client, HTTP_UNAVAIL, HTTP_UNAVAIL_DESC, NULL, exp, 0 );
	    closesocket( client );
	}
    }
    if ( storedir_alloc ) { free( (void*)storedir ); }
#ifdef AFFINITY_LINK
    afy_term( storemgr );
#endif
    intr_unhook();
    loggingTerm();
}

#ifdef DYNAMIC_LIBRARY
void attr_init dl_init( void ) {
    fprintf( stderr, "afydaemon starting up...\n" );
}

void attr_fini dl_fini( void ) {
    fprintf( stderr, "afydaemon shutting down...\n" );
}
#endif
