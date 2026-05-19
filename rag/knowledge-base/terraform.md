# Terraform — Guide complet

## Commandes essentielles (READ-ONLY recommandées)

```bash
# Initialiser un workspace
terraform init

# Voir l'état actuel
terraform show                     # état complet
terraform show -json               # JSON parseable
terraform state list               # lister les ressources
terraform state show <resource>    # détails d'une ressource

# Voir les changements prévus (SANS appliquer)
terraform plan
terraform plan -out=tfplan         # sauvegarder le plan

# Valider la configuration
terraform validate
terraform fmt --check              # vérifier le formatting

# ⚠️ Commandes DESTRUCTIVES (ne pas exécuter en prod sans vérification)
# terraform apply        → applique les changements
# terraform destroy      → DÉTRUIT TOUT
# terraform apply -auto-approve → sans confirmation
```

## Structure d'un projet Terraform

```hcl
# main.tf
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket = "my-tfstate"
    key    = "prod/terraform.tfstate"
    region = "eu-west-1"
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = var.instance_type
  tags = {
    Name        = "web-server"
    Environment = var.environment
  }
}

output "instance_ip" {
  value = aws_instance.web.public_ip
}
```

## Variables

```hcl
# variables.tf
variable "aws_region" {
  type    = string
  default = "eu-west-1"
}

variable "instance_type" {
  type    = string
  default = "t3.micro"
}

variable "environment" {
  type = string
}
```

```bash
# Passer des variables
terraform plan -var="environment=production"
terraform plan -var-file="prod.tfvars"

# Fichier prod.tfvars
environment   = "production"
instance_type = "t3.small"
```

## State (état)

```bash
# Lister toutes les ressources gérées
terraform state list

# Voir les détails d'une ressource
terraform state show aws_instance.web

# Déplacer une ressource dans le state (renommage)
terraform state mv aws_instance.web aws_instance.app

# Supprimer du state (sans détruire la ressource réelle)
terraform state rm aws_instance.web

# Importer une ressource existante dans le state
terraform import aws_instance.web i-1234567890abcdef0

# Voir le diff avec l'état réel
terraform plan    # montre ce qui sera modifié
```

## Workspaces

```bash
terraform workspace list
terraform workspace new staging
terraform workspace select production
terraform workspace show              # workspace courant
```

## Diagnostics courants

### "Error: No valid credential sources found"
```bash
# Configurer les credentials AWS
aws configure
# Ou via variables d'environnement
export AWS_ACCESS_KEY_ID=xxx
export AWS_SECRET_ACCESS_KEY=xxx
```

### "Error acquiring the state lock"
```bash
# État verrouillé (crash précédent)
terraform force-unlock <lock_id>
# Obtenir le lock_id depuis le message d'erreur
```

### "Resource already exists"
```bash
# Importer la ressource existante dans le state
terraform import <resource_type>.<name> <id>
```

### Plan très long / timeout
```bash
# Cibler une seule ressource
terraform plan -target=aws_instance.web
terraform apply -target=aws_instance.web
```

### "Changes outside of Terraform"
```bash
# Rafraîchir le state pour aligner avec la réalité
terraform refresh
# Puis terraform plan pour voir les diffs
```

## Bonnes pratiques

```bash
# Toujours faire un plan avant apply
terraform plan -out=tfplan
terraform apply tfplan

# Vérifier la configuration
terraform validate
terraform fmt

# Sauvegarder le state (remote backend recommandé)
# backend "s3" ou "azurerm" ou "gcs" — jamais de state local en équipe
```
