/* -*- Mode: C; c-file-style: "stroustrup"; indent-tabs-mode:nil; -*- */

#if !defined( _mvhttp_h )
#define _mvhttp_h

#if defined( __cplusplus )
extern "C" {
#endif

/* the purpose of this file is if you are using your own http client */

#ifndef MVD_VERS
#define MVD_VERS 0.06
#endif

#ifndef MVD_PORT
#define MVD_PORT 4560
#endif

#define MVD_QUERY_ALIAS "/db"
#define MVD_CREATE_ALIAS "/create"
#define MVD_DROP_ALIAS "/drop"

#if defined( __cplusplus )
}
#endif

#endif
