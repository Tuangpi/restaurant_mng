#!/usr/bin/env python3
import subprocess
import os

env = dict(os.environ)

result = subprocess.run(
    ['/home/tuangpi/.nvm/versions/node/v24.21.0/bin/npx', 'prisma', 'migrate', 'reset', '--preview-feature'],
    env=env,
    cwd='/home/tuangpi/Documents/My notes/restaurant_mng/apps/api'
)
print(f"Exit code: {result.returncode}")