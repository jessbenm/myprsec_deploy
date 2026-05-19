# Ansible — Guide complet

## Installation

```bash
pip3 install ansible
# ou
apt install ansible
ansible --version
```

## Commandes essentielles

```bash
# Tester la connectivité
ansible all -m ping -i inventory.ini

# Exécuter une commande ad-hoc
ansible all -m shell -a "df -h" -i inventory.ini
ansible web -m shell -a "systemctl status nginx" -i inventory.ini

# Lancer un playbook
ansible-playbook playbook.yml -i inventory.ini

# Vérifier sans exécuter (dry-run)
ansible-playbook playbook.yml -i inventory.ini --check

# Voir les différences (diff mode)
ansible-playbook playbook.yml -i inventory.ini --check --diff

# Verbose
ansible-playbook playbook.yml -v          # verbose niveau 1
ansible-playbook playbook.yml -vvv        # debug complet

# Lister les hosts qui seraient ciblés
ansible-playbook playbook.yml --list-hosts
ansible-playbook playbook.yml --list-tasks
```

## Structure d'un playbook

```yaml
---
- name: Déployer l'application
  hosts: web
  become: yes                    # sudo
  vars:
    app_dir: /opt/myapp
    app_user: www-data

  tasks:
    - name: Mettre à jour les paquets
      apt:
        update_cache: yes
        upgrade: dist

    - name: Installer les dépendances
      apt:
        name:
          - docker.io
          - docker-compose-plugin
        state: present

    - name: Créer le dossier de l'app
      file:
        path: "{{ app_dir }}"
        state: directory
        owner: "{{ app_user }}"
        mode: '0755'

    - name: Copier docker-compose.yml
      copy:
        src: docker-compose.yml
        dest: "{{ app_dir }}/docker-compose.yml"
      notify: Redémarrer l'application

    - name: Démarrer l'application
      shell: docker compose up -d
      args:
        chdir: "{{ app_dir }}"

  handlers:
    - name: Redémarrer l'application
      shell: docker compose restart
      args:
        chdir: "{{ app_dir }}"
```

## Inventaire (inventory.ini)

```ini
[web]
server1.example.com
server2.example.com ansible_port=2222

[db]
db1.example.com ansible_user=ubuntu ansible_ssh_private_key_file=~/.ssh/id_rsa

[web:vars]
ansible_user=deploy
ansible_python_interpreter=/usr/bin/python3

[all:vars]
ansible_ssh_common_args='-o StrictHostKeyChecking=no'
```

## Variables et templates

```yaml
# Fichier de variables (vars/main.yml)
app_version: "1.2.0"
db_host: "db.internal"

# Utilisation
tasks:
  - name: Config app
    template:
      src: config.j2
      dest: /etc/app/config.yml

# Template Jinja2 (config.j2)
database:
  host: {{ db_host }}
  port: 5432
version: {{ app_version }}
```

## Vault (secrets chiffrés)

```bash
# Créer un fichier chiffré
ansible-vault create secrets.yml

# Chiffrer un fichier existant
ansible-vault encrypt secrets.yml

# Déchiffrer temporairement
ansible-vault view secrets.yml

# Lancer un playbook avec vault
ansible-playbook playbook.yml --ask-vault-pass
ansible-playbook playbook.yml --vault-password-file .vault_pass
```

## Diagnostics courants

### "UNREACHABLE - SSH connection failed"
```bash
# Tester SSH manuellement
ssh -i ~/.ssh/id_rsa user@host

# Vérifier le fichier hosts
ansible all -m ping -i inventory.ini -vvv

# Désactiver strict host checking
ansible all -m ping -i inventory.ini -e "ansible_ssh_extra_args='-o StrictHostKeyChecking=no'"
```

### "Missing sudo password"
```bash
# Ajouter dans l'inventaire
ansible_become_password: mypassword
# Ou à l'exécution
ansible-playbook playbook.yml --ask-become-pass
```

### "Python not found on remote host"
```yaml
# Dans l'inventaire ou la tâche
ansible_python_interpreter: /usr/bin/python3
```

### Tâche qui prend trop longtemps
```bash
# Timeout SSH
ansible all -m shell -a "sleep 30" -i inventory.ini -e "ansible_timeout=60"
# Timeout de la tâche dans le playbook
async: 300    # 5 minutes max
poll: 10      # vérifier toutes les 10s
```
