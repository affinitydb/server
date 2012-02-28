/* -*- Mode: C; c-file-style: "stroustrup"; indent-tabs-mode:nil; -*- */
/*
Copyright (c) 2004-2012 VMware, Inc. All Rights Reserved.

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

#if !defined( _storecmd_h )
#define _storecmd_h

#if defined( __cplusplus )
extern "C" {
#endif

    extern const char* storedir;

typedef struct afy_stream_s {
    int sock;
    void* buf;
    int len;
    int clen;
} afy_stream_t;

typedef struct afy_connection_ctx_s {
    void* mgr; /* opaque pointer to the store manager */
    char* storeident; /* the owner of the store involved in this connection */
    char* storepw; /* the password attached to storeident (when needed) */
    void* storectx; /* opaque pointer to the store involved in this connection */
    void* session; /* opaque pointer to the session that may (or may not) already be bound to this connection */
} afy_connection_ctx_t;

typedef ssize_t (*Treader)(afy_stream_t*, void*, size_t);
typedef ssize_t (*Twriter)(afy_stream_t*, const void*, size_t);

    void* afy_init( void* storectx /*for MVEngine*/ );
    void afy_term( void* mgrp );

    afy_connection_ctx_t* afy_init_connection( void* mgrp, const char* storeident, const char* storepw );
    void afy_term_connection( afy_connection_ctx_t* cctxp );

    int afy_drop_store( void* mgrp, const char* storeident, const char* storepw );

    int afy_expr2json( afy_connection_ctx_t* cctxp,
                       const char* pCmd, 
                       char** ppError, size_t* len, 
                       char** params, unsigned nparams,
                       void** ppValue );

    int afy_sql2json( afy_connection_ctx_t* cctxp,
                      const char* pCmd, char** ppResult, size_t* len,
                      char** params, unsigned nparams,
                      unsigned off, unsigned lim );
    ssize_t afy_sql2raw( afy_connection_ctx_t* cctxp,
                         const char* qry, char** res, 
                         afy_stream_t* ctx, Twriter writer,
                         char** params, unsigned nparams,
                         unsigned off, unsigned lim );
    int afy_raw2raw( afy_connection_ctx_t* cctxp,
                    afy_stream_t* pCtx, Treader pReader, Twriter pWriter );

    int afy_sql2count( afy_connection_ctx_t* cctxp,
                       const char* query, char** res, size_t* len,
                       char** params, unsigned nparams, uint64_t* count );

    int afy_sql2plan( afy_connection_ctx_t* cctxp,
                      const char* query, char** res,
                      char** params, unsigned nparams );

    int afy_sql2display( afy_connection_ctx_t* cctxp,
                         const char* query, char** res );

    int afy_regNotif( afy_connection_ctx_t* cctxp,
                      const char* type, 
                      const char* notifparam, const char* clientid, 
                      char **res );

    int afy_unregNotif( afy_connection_ctx_t* cctxp,
                        const char* notifparam, const char* clientid, 
                        char **res );

    int afy_waitNotif( afy_connection_ctx_t* cctxp,
                       const char* notifparam, const char* clientid, 
                       int timeout, char **res );

    void afy_free( afy_connection_ctx_t* cctxp, void* ptr );
    void afy_freev( afy_connection_ctx_t* cctxp, void* v );
    const char* afy_val2str( void* pValue );
    uint32_t afy_val2len( void* pValue );
                       
#if defined( __cplusplus )
}
#endif

#endif
