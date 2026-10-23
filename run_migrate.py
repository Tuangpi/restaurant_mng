#!/usr/bin/env python3
import subprocess
import os

env = dict(os.environ)
env['DATABASE_URL'] = 'postgresql://restaurant_mng:restaurant_mng_dev@localhost:5432/restaurant_mng'

result = subprocess.run(
    ['/home/tuangpi/.nvm/versions/node/v24.21.0/bin/npx', 'prisma', 'migrate', 'reset', 
     '--schema', 'prisma/schema.prisma', '--preview-feature'],
    env=env,
    cwd='/home/tuangpi/Documents/My notes/restaurant_mng'
)
print(f"Exit code: {result.returncode}")