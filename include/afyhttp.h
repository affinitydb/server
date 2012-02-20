/* -*- Mode: C; c-file-style: "stroustrup"; indent-tabs-mode:nil; -*- */

#if !defined( _afyhttp_h )
#define _afyhttp_h

#if defined( __cplusplus )
extern "C" {
#endif

/* the purpose of this file is if you are using your own http client */

#ifndef AFYD_VERS
#define AFYD_VERS 0.06
#endif

#ifndef AFYD_PORT
#define AFYD_PORT 4560
#endif

#define AFYD_QUERY_ALIAS "/db"
#define AFYD_CREATE_ALIAS "/create"
#define AFYD_DROP_ALIAS "/drop"

#if defined( __cplusplus )
}
#endif

#endif
