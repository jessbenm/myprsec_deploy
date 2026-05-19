# Kubernetes — Guide complet

## Commandes de base

```bash
kubectl get nodes                          # lister les noeuds
kubectl get pods                           # pods du namespace courant
kubectl get pods -A                        # tous les namespaces
kubectl get pods -n <namespace>            # pods d'un namespace
kubectl get deployments -A                 # toutes les deployments
kubectl get services -A                    # tous les services
kubectl get namespaces                     # lister les namespaces
kubectl get all -n <namespace>             # tout dans un namespace
```

## Inspecter et déboguer

```bash
kubectl describe pod <pod> -n <namespace>          # détails complets
kubectl describe deployment <name> -n <namespace>
kubectl describe service <name> -n <namespace>
kubectl describe node <node>

# Logs d'un pod
kubectl logs <pod> -n <namespace>                  # logs complets
kubectl logs -f <pod> -n <namespace>               # suivre
kubectl logs --tail=100 <pod> -n <namespace>       # 100 dernières lignes
kubectl logs <pod> -c <container> -n <namespace>   # conteneur spécifique
kubectl logs --previous <pod> -n <namespace>       # pod crashé précédent

# Exécuter une commande dans un pod
kubectl exec -it <pod> -n <namespace> -- sh
kubectl exec -it <pod> -n <namespace> -- bash
kubectl exec <pod> -n <namespace> -- <commande>
```

## Ressources et métriques

```bash
kubectl top nodes                          # CPU/RAM des noeuds
kubectl top pods -A                        # CPU/RAM des pods
kubectl top pods -n <namespace>
```

## Diagnostiquer CrashLoopBackOff

```bash
# 1. Identifier le pod problématique
kubectl get pods -A | grep -v Running

# 2. Voir les logs du crash précédent
kubectl logs --previous <pod> -n <namespace>

# 3. Décrire pour voir les events
kubectl describe pod <pod> -n <namespace>
# Chercher dans "Events:" les erreurs

# 4. Causes communes :
# - Application qui crash au démarrage (voir logs)
# - Variable d'environnement manquante
# - Liveness probe qui échoue
# - OOMKilled (manque de mémoire)
# - Image introuvable (ImagePullBackOff)
```

## Diagnostiquer un pod Pending

```bash
kubectl describe pod <pod> -n <namespace>
# Dans "Events:", chercher :
# - "Insufficient cpu/memory" → manque de ressources sur les noeuds
# - "no nodes available to schedule" → tous les noeuds tainted
# - "PodScheduled False" → scheduler ne peut pas placer le pod

# Voir les ressources disponibles sur les noeuds
kubectl describe nodes | grep -A5 "Allocated resources"
```

## Service non joignable

```bash
# 1. Vérifier que le service existe
kubectl get svc -n <namespace>

# 2. Vérifier que les endpoints pointent vers des pods
kubectl get endpoints <service> -n <namespace>
# Si "none" → les labels du service ne matchent pas les pods

# 3. Vérifier les labels du pod
kubectl get pods -n <namespace> --show-labels

# 4. Tester la connectivité depuis l'intérieur du cluster
kubectl run debug --rm -it --image=alpine -n <namespace> -- sh
# Puis : wget -qO- http://<service>:<port>
```

## Resource limits

```yaml
resources:
  requests:
    memory: "64Mi"
    cpu: "250m"
  limits:
    memory: "128Mi"
    cpu: "500m"
```

```bash
# Voir les limits actuelles
kubectl get pods <pod> -o yaml -n <namespace> | grep -A10 resources
```

## Namespaces

```bash
kubectl create namespace <name>
kubectl delete namespace <name>
kubectl config set-context --current --namespace=<namespace>  # défaut
```

## Redémarrer un déploiement

```bash
kubectl rollout restart deployment/<name> -n <namespace>
kubectl rollout status deployment/<name> -n <namespace>
kubectl rollout history deployment/<name> -n <namespace>
kubectl rollout undo deployment/<name> -n <namespace>          # rollback
```

## k3s — commandes spécifiques

```bash
# Installation
curl -sfL https://get.k3s.io | sh -

# Statut
systemctl status k3s
journalctl -u k3s -f

# kubeconfig
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
# Ou : sudo k3s kubectl get nodes
```

## microk8s — commandes spécifiques

```bash
microk8s status
microk8s kubectl get nodes
microk8s enable dns storage ingress
microk8s inspect                  # diagnostics
```

## Cas d'erreurs fréquentes

### ImagePullBackOff
```bash
kubectl describe pod <pod> | grep -A5 Events
# → Image inexistante ou accès registry non configuré
# Vérifier : kubectl get secret -n <namespace>
```

### Evicted pods
```bash
kubectl get pods -A | grep Evicted
kubectl delete pods --field-selector=status.phase=Failed -A
# Cause : noeud à court de ressources (disque ou mémoire)
df -h  # sur le noeud
```
