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

#if !defined( _afyclient_h )
#define _afyclient_h

/* the purpose of this file is to provide the API for the afyclient
 * embedded http client that acts as an API talking to affinityd
 */

/* nb this ifndef can be removec with next store version, but for now */
/* kernel/include/affinity.h conflicts with stdint.h */
#ifndef UINT64_DEFINED
/* uint16_t */
#include <stdint.h>		
#endif

/* off_t */
#include <sys/stat.h>
/* size_t */
#include <sys/types.h>

#if defined( WIN32 ) && defined( LIBRARY )
#define export __declspec(dllexport)
#else
#define export
#endif

#if defined( WIN32 )
#define ssize_t int
#endif

#include "afyhttp.h"             /* for AFYD_PORT */

#if defined( __cplusplus )
extern "C" {
#endif

#define AFYC_BUF_SIZE 16384

#define AFYC_PORT AFYD_PORT       /* alias for naming consistency */

    typedef struct afyc_s {
        int sock, ka, url, chunked;
        const char* host;
        uint16_t port;
        const char* identity, *store, *user, *pass;
        char buf[AFYC_BUF_SIZE+1];
        char* body;
        size_t body_len;
        size_t chunk;
        off_t clen;
    } afyc_t;

    export int afyc_connect( afyc_t* db, const char* host, uint16_t port, 
                            const char* identity, const char* store,
                            const char* user, const char* pass );
    export int afyc_reconnect( afyc_t* db );

    typedef enum oformat_e { JSON, PROTOBUF } oformat_t;
    typedef enum query_e { QUERY, EXPRESSION, COUNT, 
                           PLAN, DISPLAY, CREATE, DROP } query_t;

    export int afyc_sql( afyc_t* db, const char* query, const char* method, 
                        oformat_t ofmt, query_t type, 
                        size_t offset, size_t limit );

    export int afyc_create( afyc_t* db, const char* store );
    export int afyc_drop( afyc_t* db, const char* store );

    export ssize_t afyc_read( afyc_t* db, void* buf, size_t buf_len );
    export ssize_t afyc_write( afyc_t* db, const void* out, size_t out_len );
    export int afyc_done( afyc_t* db );
    export int afyc_disconnect( afyc_t* db );
#define afyc_sock( db ) ((db)->sock)
#define afyc_clen( db ) ((db)->clen)

#define AFYC_CONTINUE 0
#define AFYC_WRITE_REQUEST -1
#define AFYC_SQL_ERROR -2
#define AFYC_CONNECTION_FAIL -3
#define AFYC_UNSUPPORTED -4
#define AFYC_ERROR -5

#if defined( __cplusplus )
}
#endif

#endif
