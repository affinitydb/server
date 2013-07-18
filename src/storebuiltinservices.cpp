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

#if !defined(POSIX) && !defined(WIN32)
    // For python distutils... I may find a better solution with their 'define_macros'.
    #define POSIX
#endif
#ifdef WIN32
    #define WIN32_LEAN_AND_MEAN
#endif

#include <sstream>
#include <stdio.h>
#include <stdlib.h>
#include <ctype.h>
#if !defined(Darwin)
#include <malloc.h>
#endif
#include <errno.h>
#include "startup.h"
#include "affinity.h"
#include "storebuiltinservices.h"
#include <math.h>

using namespace Afy;

class BISMathRandom : public IService
{
  public:
    class BISMathRandomProcessor : public IService::Processor
    {
      public:
        virtual RC invoke(IServiceCtx *ctx,const Afy::Value& inp, Afy::Value& out, unsigned int&)
        {
          out.set((double)rand());
          return RC_OK;
        }
        virtual void cleanup(IServiceCtx *ctx,bool fDestroy) {if (fDestroy){this->~BISMathRandomProcessor(); ctx->free(this);}}
    };
  public:
    BISMathRandom() {}
    virtual RC create(IServiceCtx *ctx,uint32_t& dscr,IService::Processor *&ret)
    {
      ret = new (ctx->malloc(sizeof(BISMathRandomProcessor))) BISMathRandomProcessor();
      return RC_OK;
    }
};

RC afy_regBuiltinServices(IAffinity * pCtx)
{
  return pCtx->registerService("Math.random", new BISMathRandom());
}
