FROM docker:cli

RUN apk add --no-cache git python3 bash

WORKDIR /app

COPY webhook_server.py .
COPY deploy.sh .
RUN chmod +x deploy.sh

EXPOSE 9000

CMD ["python3", "/app/webhook_server.py"]
