/* -*- Mode: C; c-file-style: "stroustrup"; indent-tabs-mode:nil; -*- */

#if !defined( _mvdaemon_h )
#define _mvdaemon_h

/* The purpose of this file is integration with mvengine */

/* nb this ifndef can be removec with next store version, but for now */
/* kernel/include/mvstore.h conflicts with stdint.h */
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

    export int mvdaemon( void *ctx, const char* wwwdir, const char* storedir,
                         uint16_t port, int verbose, int auto_flag );

    export int mvdaemon_stop( uint32_t usec );

#if defined( __cplusplus )
}
#endif

#endif
