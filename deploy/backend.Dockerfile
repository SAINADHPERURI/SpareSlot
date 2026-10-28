# SpareSlot API. Build context: the backend/ folder.
#   docker build -f deploy/backend.Dockerfile backend
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -q -B dependency:go-offline
COPY src src
RUN ./mvnw -q -B -DskipTests package && cp target/spareslot-backend-*.jar app.jar

FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 spareslot
WORKDIR /app
COPY --from=build /src/app.jar app.jar
USER spareslot
EXPOSE 8080
# Configuration comes only from the environment: DATABASE_URL, DATABASE_USERNAME, DATABASE_PASSWORD,
# JWT_SECRET, CORS_ORIGINS, DEMO_LOGIN_ENABLED, PORT.
# sized for small containers (512 MB on free hosting plans)
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=60", "-XX:+UseSerialGC", "-Xss512k", "-jar", "/app/app.jar"]
