если ты в папке (проекте) aeroclub. 
то при тестах для отладки. 
1. команда обновить backend "rsync -avz /workspaces/allcodespaces/aeroclub/backend/ root@78.47.125.10:/root/allcodespaces/aeroclub/backend/"
2. команда смотреть логи backend ssh root@78.47.125.10 "PATH=/root/.nvm/versions/node/v14.15.3/bin:$PATH /root/.nvm/versions/node/v14.15.3/bin/pm2 logs 45"

чтоб обновить фронтенд админки
rsync -avz --exclude 'node_modules' --exclude 'package-lock.json' /workspaces/allcodespaces/aeroclub/admin-app/ root@78.47.125.10:/root/allcodespaces/aeroclub/admin-app/

 2. ssh root@78.47.125.10 "PATH=/root/.nvm/versions/node/v14.15.3/bin:$PATH /root/.nvm/versions/node/v14.15.3/bin/pm2 restart aeroclub_admin"