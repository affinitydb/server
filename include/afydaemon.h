/* -*- Mode: C; c-file-style: "stroustrup"; indent-tabs-mode:nil; -*- */

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
