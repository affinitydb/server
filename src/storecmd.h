/* -*- Mode: C; c-file-style: "stroustrup"; indent-tabs-mode:nil; -*- */

#if !defined( _storecmd_h )
#define _storecmd_h

#if defined( __cplusplus )
extern "C" {
#endif

    extern const char* storedir;

typedef struct mvs_stream_s {
    int sock;
    void* buf;
    int len;
    int clen;
} mvs_stream_t;

typedef struct session_s {
    void* ptr;                  /* opaque pointer to ISession */
} session_t;

typedef ssize_t (*Treader)(mvs_stream_t*, void*, size_t);
typedef ssize_t (*Twriter)(mvs_stream_t*, const void*, size_t);

    void mvs_session( void* mgrp, session_t* sessp );

    int mvs_close( session_t* sessp );

    void mvs_free( session_t* sessp, void* ptr );

    void mvs_freev( session_t* sessp, void* v );
    const char* mvs_val2str( void* pValue );
    uint32_t mvs_val2len( void* pValue );

    void* mvs_init( void* ctx, int auto_create );

    int mvs_expr2json( session_t* sessp, const char* pUser, 
                       const char* pPassword, const char* pCmd, 
                       char** ppError, size_t* len, 
                       char** params, unsigned nparams,
                       void** ppValue );

    int mvs_sql2json( session_t* sess, const char* pUser, const char* pass, 
                      const char* pCmd, char** ppResult, size_t* len,
                      char** params, unsigned nparams,
                      unsigned off, unsigned lim );
    ssize_t mvs_sql2raw( session_t* sess, const char* user, const char* pass, 
                         const char* qry, char** res, 
                         mvs_stream_t* ctx, Twriter writer,
                         char** params, unsigned nparams,
                         unsigned off, unsigned lim );
    int mvs_raw2raw( session_t* sess, const char* pUser, const char* pass, 
                    mvs_stream_t* pCtx, Treader pReader, Twriter pWriter );

    int mvs_sql2count( session_t* sessp, const char* user, const char* pass,
                       const char* query, char** res, size_t* len,
                       char** params, unsigned nparams, uint64_t* count );

    int mvs_sql2plan( session_t* sessp, const char* user, const char* pass,
                      const char* query, char** res,
                      char** params, unsigned nparams );

    int mvs_sql2display( session_t* sessp, const char* user, const char* pass,
                         const char* query, char** res );

    int mvs_regNotif( void* db, session_t* sessp, 
                      const char* user, const char* pass, const char* type, 
                      const char* notifparam, const char* clientid, 
                      char **res );

    int mvs_unregNotif( void* db, session_t* sessp, 
                        const char* user, const char* pass,
                        const char* notifparam, const char* clientid, 
                        char **res );

    int mvs_waitNotif( void* db, session_t* sessp, 
                       const char* user, const char* pass,
                       const char* notifparam, const char* clientid, 
                       int timeout, char **res );

    void mvs_term( void* pStoreMgr );

#if defined( __cplusplus )
}
#endif

#endif
