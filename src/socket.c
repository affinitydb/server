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
#include <string.h>
#include <stdlib.h>
#include <errno.h>
#include "http.h"
#include "socket.h"
#include "intr.h"
#if defined(__linux__)
#include <linux/tcp.h>
#endif

int sock_init( void ) {
#ifdef WIN32
    static int initialized = 0;
    WORD wVersionRequested = MAKEWORD(1,1);
    WSADATA wsaData;
    int err;
    if ( !initialized ) {
        err = WSAStartup( wVersionRequested, &wsaData );
        if ( err != 0 ) {
            fprintf( stderr, "could not find usable winsock.dll\n" );
            exit( EXIT_FAILURE );
        }
        initialized = 1;
    }
#endif
    return 1;
}

int sock_connect( const char* host, int port ) {
    struct sockaddr_in addr;
    struct hostent* server = gethostbyname( host );
    int sock = -1, res = -1;

    if ( server == NULL ) { return -1; }
    
    sock = socket( AF_INET, SOCK_STREAM, 0 );
    if ( sock == -1 ) { return -1; }

    addr.sin_family = server->h_addrtype;
    memcpy( &addr.sin_addr, server->h_addr, server->h_length );
    addr.sin_port = htons( port );

    res = connect( sock, (struct sockaddr*)&addr, sizeof( addr ) );
    if ( res == -1 ) { return -1; }
    return sock;
}

int sock_listener( int port ) {
    int list = -1;
    int res = -1, opt = 1;
    struct sockaddr_in addr;

    list = socket( AF_INET, SOCK_STREAM, 0 );
    if ( list < 0 ) { exit( EXIT_FAILURE ); }
    res = setsockopt( list, SOL_SOCKET, SO_REUSEADDR,
                      (void*)&opt, sizeof(opt) );
    if ( res < 0 ) {
        fprintf( stderr, "could not set SO_REUSEADDR (%s)\n",
                 s_strerror(s_errno) );
    }
    // Note:
    //   For the time being we mostly expect LAN access;
    //   some scenarios clearly benefit from turning
    //   nagle off.
    res = setsockopt( list, IPPROTO_TCP, TCP_NODELAY,
                      (char*)&opt, sizeof(opt) );
    if ( res < 0 ) {
        fprintf( stderr, "could not set TCP_NODELAY (%s)\n",
                 s_strerror(s_errno) );
    }
  
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons( port );
    res = bind( list, (struct sockaddr*)&addr, sizeof( addr ) );
    if ( res < 0 ) {
        fprintf( stderr, "could not bind to port %u (%s)\n", 
                 port, s_strerror(s_errno) );
        exit( EXIT_FAILURE ); 
    }
    res = listen( list, SOMAXCONN );
    if ( res < 0 ) { 
        fprintf( stderr, "could not listen on port %u (%s)\n", 
                 port, s_strerror(s_errno) );
        exit( EXIT_FAILURE ); 
    }
    
    return list;
}

int sock_select( int sock, unsigned timeoutInS ) {
    fd_set lSet;
    struct timeval lTo;
    FD_ZERO(&lSet);
    FD_SET(sock, &lSet);
    lTo.tv_sec = (long)timeoutInS;
    lTo.tv_usec = 0;
    return select( sock + 1, &lSet, (fd_set *) 0, (fd_set *) 0, &lTo );
}

ssize_t sock_read( int sock, void* bufp, size_t size ) {
    unsigned char* buf = bufp;
    size_t tot = 0;
    ssize_t rd = 0;
    for ( tot = 0, rd = 1; rd > 0 && tot < size; tot += rd ) {
        rd = recv( sock, buf+tot, size-tot, 0 );
        if ( rd < 0 ) { return rd; }
    }
    return (ssize_t)tot;
}

ssize_t sock_write( int sock, const void* bufp, size_t blen ) {
    const unsigned char* buf = bufp;
    size_t wlen;
    ssize_t res = 1;
    for ( wlen = 0; res > 0 && wlen < blen;  ) {
        res = send( sock, buf+wlen, blen-wlen, 0 );
        if ( res > 0 ) { wlen += res; }
    }
    if ( res < 0 ) { return res; }
    return (ssize_t)wlen;
}

int sock_halfshut( int sock ) {
    int res;
    res = shutdown( sock, SHUT_WR );
    return res == 0 ? 1 : 0;
}

int sock_close( int sock ) {
    int res;
    res = shutdown( sock, SHUT_RDWR );
    if ( res < 0 ) {
        fprintf( stderr, "[%s] client disconnect: %s\n", ltime(), 
                 s_strerror(s_errno) );
    }
    closesocket( sock );
    return res;
}
