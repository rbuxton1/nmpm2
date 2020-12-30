#!/bin/bash
echo "Stoping any running instances. . ."
docker-compose stop
echo "DONE!"
echo "- - - - - - - - - - - - - - - - - -"
echo "Updating from git . . ."
git pull
echo "DONE!"
echo "- - - - - - - - - - - - - - - - - -"
echo "Starting detached, forcing a new build. . ."
docker-compose up --build -d
