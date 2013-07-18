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

#if !defined( _afydaemon_h )
#define _afydaemon_h

/* The purpose of this file is integration with afyengine */

/* nb this ifndef can be removec with next store version, but for now */
/* kernel/include/affinity.h conflicts with stdint.h */
#ifndef UINT64_DEFINED
#include <stdint.h>
#endif

#if defined( WIN32 ) && defined( LIBRARY )
#define export __declspec(dllexport)
#else
#define export
#endif

#if defined( __cplusplus )
extern "C" {
#endif

    export int afydaemon( void *ctx, const char* wwwdir, const char* storedir,
                         uint16_t port, int verbose, int auto_flag );

    export int afydaemon_stop( uint32_t usec );

#if defined( __cplusplus )
}
#endif

#endif
