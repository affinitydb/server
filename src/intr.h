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
