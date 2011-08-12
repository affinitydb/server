/* -*- Mode: C; c-file-style: "stroustrup"; indent-tabs-mode:nil; -*- */

#if !defined( _intr_h )
#define _intr_h

#if defined( __cplusplus )
extern "C" {
#endif

#ifdef WIN32
#ifndef LIBRARY
    extern HANDLE __declspec(thread) intr_handle;
#endif
#endif
    extern volatile int intr;
    extern int intr_sig;
    void intr_handler( int sig );
    int intr_hook( int );
    int intr_unhook( void );

#if defined( __cplusplus )
}
#endif

#endif
