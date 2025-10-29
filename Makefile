DOCKER_BUILD=./docker-compose.yml

up:down
	cd web_app && ./docker-up.sh up -d --remove-orphans


up-b:down
	cd web_app && ./docker-up.sh up -d --build --remove-orphans

up-stag:down-stag
	cd web_app && ./docker-up.sh -f docker-compose.stag.yml up --renew-anon-volumes --remove-orphans -d


up-b-stag:down-stag
	cd web_app && ./docker-up.sh -f docker-compose.stag.yml up --renew-anon-volumes --remove-orphans --build -d

down:
	docker compose  -f web_app/$(DOCKER_BUILD)  --profile all down --remove-orphans

down-stag:
	docker compose -f web_app/docker-compose.stag.yml --profile all down --remove-orphans
