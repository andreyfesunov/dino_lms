# Публикация образов

Workflow `.github/workflows/publish-images.yml` запускается при пуше тегов `v*` или
начинающихся с цифры. Тег должен совпадать с корневым `VERSION`, с необязательным
префиксом `v`. Например, для `VERSION = 0.1.0`:

```sh
git tag v0.1.0
git push origin v0.1.0
```

После Go- и клиентских проверок публикуются два образа для `linux/amd64`:

- `ghcr.io/andreyfesunov/dino_lms-api:0.1.0`
- `ghcr.io/andreyfesunov/dino_lms-client:0.1.0`

В другом репозитории префикс образов автоматически берётся из его имени.
Для стабильных версий также публикуется `latest`; версии вида `0.2.0-rc.1`
его не обновляют. Версия API внутри образа берётся из `VERSION` при сборке.

Вход в GHCR использует встроенный `GITHUB_TOKEN` с `packages: write`, отдельный
PAT не нужен. Если пакет уже существует, он должен разрешать Actions этого
репозитория запись. Видимость пакетов настраивается отдельно в GitHub Packages.

В lock-файле клиента ссылки ведут на `registry.truvisibility.com`. При сборке
в Docker и Actions npm перенаправляет их на публичный `registry.npmjs.org`,
сохраняя зафиксированные версии и проверки целостности. Доступ к корпоративному
registry для публикации не требуется.

## Запуск

Клиент раздаёт Angular через nginx, проксируя `/api` и `/media` на `api:8080`.
Контейнер API должен быть доступен под именем `api` в общей Docker-сети:

```sh
docker network create dino
docker volume create dino-data
docker run -d --name api --network dino -v dino-data:/app/data ghcr.io/andreyfesunov/dino_lms-api:0.1.0
docker run -d --name client --network dino -p 8080:80 ghcr.io/andreyfesunov/dino_lms-client:0.1.0
```

Открыть `http://localhost:8080`. SQLite хранится в томе `dino-data`.
Образ API содержит текущие курсы; для собственного каталога подключите его
в `/app/courses` как read-only bind mount. API применяет миграции при запуске.
Утилита `initializer` также включена в образ API и доступна через
`--entrypoint /app/initializer`.

Локальная сборка без публикации:

```sh
docker build -f Dockerfile.api -t dino-api .
docker build -f Dockerfile.client -t dino-client .
```
