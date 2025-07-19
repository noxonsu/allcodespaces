# -*- encoding: utf-8 -*-
"""
Copyright (c) 2019 - present AppSeed.us
"""
import multiprocessing


bind = '0.0.0.0:8000'
# workers = multiprocessing.cpu_count() * 2 + 1
workers = 6
accesslog = './web-server.log'
loglevel = 'debug'
capture_output = True
enable_stdio_inheritance = True
reload = True
timeout = 900
