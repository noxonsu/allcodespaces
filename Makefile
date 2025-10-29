DOCKER_BUILD=./docker-compose.yml

up:down
	docker compose -f web_app/$(DOCKER_BUILD) --profile all up -d --remove-orphans


up-b:down
	docker compose -f  web_app/$(DOCKER_BUILD) --profile all up -d --build --remove-orphans

up-stag:down-stag
	docker compose -f web_app/docker-compose.stag.yml --profile all   up  --renew-anon-volumes --remove-orphans  -d


up-b-stag:down-stag
	docker compose -f web_app/docker-compose.stag.yml --profile all   up  --renew-anon-volumes --remove-orphans  --build  -d

down:
	docker compose  -f web_app/$(DOCKER_BUILD)  --profile all down --remove-orphans

down-stag:
	docker compose -f web_app/docker-compose.stag.yml --profile all down --remove-orphans
