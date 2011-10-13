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

typedef struct mvs_connection_ctx_s {
    void* mgr; /* opaque pointer to the store manager */
    char* storeident; /* the owner of the store involved in this connection */
    char* storepw; /* the password attached to storeident (when needed) */
    void* storectx; /* opaque pointer to the store involved in this connection */
    void* session; /* opaque pointer to the session that may (or may not) already be bound to this connection */
} mvs_connection_ctx_t;

typedef ssize_t (*Treader)(mvs_stream_t*, void*, size_t);
typedef ssize_t (*Twriter)(mvs_stream_t*, const void*, size_t);

    void* mvs_init( void* storectx /*for MVEngine*/ );
    void mvs_term( void* mgrp );

    mvs_connection_ctx_t* mvs_init_connection( void* mgrp, const char* storeident, const char* storepw );
    void mvs_term_connection( mvs_connection_ctx_t* cctxp );

    int mvs_drop_store( void* mgrp, const char* storeident, const char* storepw );

    int mvs_expr2json( mvs_connection_ctx_t* cctxp,
                       const char* pCmd, 
                       char** ppError, size_t* len, 
                       char** params, unsigned nparams,
                       void** ppValue );

    int mvs_sql2json( mvs_connection_ctx_t* cctxp,
                      const char* pCmd, char** ppResult, size_t* len,
                      char** params, unsigned nparams,
                      unsigned off, unsigned lim );
    ssize_t mvs_sql2raw( mvs_connection_ctx_t* cctxp,
                         const char* qry, char** res, 
                         mvs_stream_t* ctx, Twriter writer,
                         char** params, unsigned nparams,
                         unsigned off, unsigned lim );
    int mvs_raw2raw( mvs_connection_ctx_t* cctxp,
                    mvs_stream_t* pCtx, Treader pReader, Twriter pWriter );

    int mvs_sql2count( mvs_connection_ctx_t* cctxp,
                       const char* query, char** res, size_t* len,
                       char** params, unsigned nparams, uint64_t* count );

    int mvs_sql2plan( mvs_connection_ctx_t* cctxp,
                      const char* query, char** res,
                      char** params, unsigned nparams );

    int mvs_sql2display( mvs_connection_ctx_t* cctxp,
                         const char* query, char** res );

    int mvs_regNotif( mvs_connection_ctx_t* cctxp,
                      const char* type, 
                      const char* notifparam, const char* clientid, 
                      char **res );

    int mvs_unregNotif( mvs_connection_ctx_t* cctxp,
                        const char* notifparam, const char* clientid, 
                        char **res );

    int mvs_waitNotif( mvs_connection_ctx_t* cctxp,
                       const char* notifparam, const char* clientid, 
                       int timeout, char **res );

    void mvs_free( mvs_connection_ctx_t* cctxp, void* ptr );
    void mvs_freev( mvs_connection_ctx_t* cctxp, void* v );
    const char* mvs_val2str( void* pValue );
    uint32_t mvs_val2len( void* pValue );
                       
#if defined( __cplusplus )
}
#endif

#endif
