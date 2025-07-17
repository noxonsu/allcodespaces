DOCKER_BUILD=./docker-compose.yml

up:down
	docker compose -f  $(DOCKER_BUILD) --profile all up -d --remove-orphans


up-b:down
	docker compose -f  $(DOCKER_BUILD) --profile all up -d --build --remove-orphans
#	docker compose  -f web_app/$(DOCKER_BUILD) --profile backend  up  --renew-anon-volumes --remove-orphans  revers-proxy celery-worker celery-beat  -d


up-b-stag:down
	docker compose -f ./docker-compose.stag.yml --profile all   up  --renew-anon-volumes --remove-orphans  --build  -d

down:
	docker compose  -f $(DOCKER_BUILD)  --profile all down --remove-orphans
