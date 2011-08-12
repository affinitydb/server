/* -*- Mode: C; c-file-style: "stroustrup"; indent-tabs-mode:nil; -*- */

#if !defined( _socket_h )
#define _socket_h

#include "portability.h"

#if defined( __cplusplus )
extern "C" {
#endif

    int sock_init( void );
    int sock_connect( const char* host, int port );
    int sock_listener( int port );
    ssize_t sock_read( int sock, void* buf, size_t size );
    ssize_t sock_write( int sock, const void* buf, size_t blen );
    int sock_halfshut( int sock );
    int sock_close( int sock );

#if defined( __cplusplus )
}
#endif

#endif
