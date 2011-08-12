/* -*- Mode: C; c-file-style: "stroustrup"; indent-tabs-mode:nil; -*- */

#if !defined( _mvclient_h )
#define _mvclient_h

/* the purpose of this file is to provide the API for the mvclient
 * embedded http client that acts as an API talking to mvstored
 */

/* nb this ifndef can be removec with next store version, but for now */
/* kernel/include/mvstore.h conflicts with stdint.h */
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

#include "mvhttp.h"             /* for MVD_PORT */

#if defined( __cplusplus )
extern "C" {
#endif

#define MVC_BUF_SIZE 16384

#define MVC_PORT MVD_PORT       /* alias for naming consistency */

    typedef struct mvc_s {
        int sock, ka, url, chunked;
        const char* host;
        uint16_t port;
        const char* identity, *store, *user, *pass;
        char buf[MVC_BUF_SIZE+1];
        char* body;
        size_t body_len;
        size_t chunk;
        off_t clen;
    } mvc_t;

    export int mvc_connect( mvc_t* db, const char* host, uint16_t port, 
                            const char* identity, const char* store,
                            const char* user, const char* pass );
    export int mvc_reconnect( mvc_t* db );

    typedef enum oformat_e { JSON, PROTOBUF } oformat_t;
    typedef enum query_e { QUERY, EXPRESSION, COUNT, 
                           PLAN, DISPLAY, CREATE, DROP } query_t;

    export int mvc_sql( mvc_t* db, const char* query, const char* method, 
                        oformat_t ofmt, query_t type, 
                        size_t offset, size_t limit );

    export int mvc_create( mvc_t* db, const char* store );
    export int mvc_drop( mvc_t* db, const char* store );

    export ssize_t mvc_read( mvc_t* db, void* buf, size_t buf_len );
    export ssize_t mvc_write( mvc_t* db, const void* out, size_t out_len );
    export int mvc_done( mvc_t* db );
    export int mvc_disconnect( mvc_t* db );
#define mvc_sock( db ) ((db)->sock)
#define mvc_clen( db ) ((db)->clen)

#define MVC_CONTINUE 0
#define MVC_WRITE_REQUEST -1
#define MVC_SQL_ERROR -2
#define MVC_CONNECTION_FAIL -3
#define MVC_UNSUPPORTED -4
#define MVC_ERROR -5

#if defined( __cplusplus )
}
#endif

#endif
