# Jenkins — Guide complet

## Commandes essentielles

```bash
# Démarrer/arrêter Jenkins
systemctl start jenkins
systemctl stop jenkins
systemctl restart jenkins
systemctl status jenkins

# Logs Jenkins
journalctl -u jenkins -f
tail -f /var/log/jenkins/jenkins.log
cat /var/lib/jenkins/jenkins.log

# Port par défaut
curl http://localhost:8080/api/json?pretty=true

# Récupérer le mot de passe initial
cat /var/lib/jenkins/secrets/initialAdminPassword
```

## API REST Jenkins

```bash
JENKINS_URL=http://localhost:8080
USER=admin
TOKEN=<api-token>
AUTH="$USER:$TOKEN"

# Lister les jobs
curl -u $AUTH $JENKINS_URL/api/json?tree=jobs[name,color,lastBuild[number,result]]

# Déclencher un build
curl -X POST -u $AUTH $JENKINS_URL/job/<job_name>/build

# Voir le statut du dernier build
curl -u $AUTH $JENKINS_URL/job/<job_name>/lastBuild/api/json

# Voir les logs d'un build
curl -u $AUTH $JENKINS_URL/job/<job_name>/<build_number>/consoleText

# Annuler un build
curl -X POST -u $AUTH $JENKINS_URL/job/<job_name>/<build_number>/stop
```

## Jenkinsfile (Pipeline as Code)

```groovy
pipeline {
    agent any

    environment {
        DEPLOY_ENV = 'production'
    }

    stages {
        stage('Checkout') {
            steps {
                git branch: 'main', url: 'https://github.com/user/repo'
            }
        }

        stage('Build') {
            steps {
                sh 'npm ci && npm run build'
            }
        }

        stage('Test') {
            steps {
                sh 'npm test'
            }
            post {
                always {
                    junit 'test-results/**/*.xml'
                }
            }
        }

        stage('Deploy') {
            when { branch 'main' }
            steps {
                sshPublisher(publishers: [
                    sshPublisherDesc(configName: 'mon-serveur',
                        transfers: [sshTransfer(
                            execCommand: 'cd /opt/app && git pull && docker compose up -d --build'
                        )])
                ])
            }
        }
    }

    post {
        failure {
            emailext subject: "Build Failed: ${env.JOB_NAME}",
                      body: "Check ${env.BUILD_URL}",
                      to: "team@example.com"
        }
    }
}
```

## Tokens API Jenkins

```bash
# Créer un token API (via interface web) :
# Jenkins → votre profil → Configure → API Token → Add new Token

# Utilisation avec curl (Basic Auth)
curl -u admin:<api_token> http://localhost:8080/api/json

# Utilisation avec CSRF (si activé)
CRUMB=$(curl -s -u $AUTH "$JENKINS_URL/crumbIssuer/api/xml?xpath=concat(//crumbRequestField,\":\",//crumb)")
curl -X POST -u $AUTH -H "$CRUMB" $JENKINS_URL/job/<job>/build
```

## Diagnostics courants

### Jenkins ne démarre pas
```bash
journalctl -u jenkins -n 50
# Vérifier Java
java -version
# Java 11 ou 17 requis selon la version
systemctl status jenkins
```

### Build bloqué en queue
```bash
# Vérifier les agents disponibles
curl -u $AUTH $JENKINS_URL/computer/api/json?pretty=true
# Si "idle: false" → tous les agents occupés
```

### "403 No valid crumb was included"
```bash
# Désactiver la protection CSRF (dev seulement) ou récupérer le crumb
CRUMB=$(curl -s -u $AUTH "$JENKINS_URL/crumbIssuer/api/xml?xpath=concat(//crumbRequestField,\":\",//crumb)")
curl -X POST -u $AUTH -H "$CRUMB" $JENKINS_URL/job/<job>/build
```

### Espace disque insuffisant pour les builds
```bash
# Nettoyer les anciens builds
curl -X POST -u $AUTH "$JENKINS_URL/job/<job>/doWipeOutWorkspace"
# Ou configurer "Discard old builds" dans la config du job
```

### Plugin manquant
```bash
# Via l'interface : Manage Jenkins → Plugins → Available
# Via CLI :
java -jar jenkins-cli.jar -s http://localhost:8080 -auth $AUTH install-plugin <plugin-name>
java -jar jenkins-cli.jar -s http://localhost:8080 -auth $AUTH safe-restart
```
