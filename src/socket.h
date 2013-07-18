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
