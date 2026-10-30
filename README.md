# Bot de modération FadeHost

[![Déployer sur FadeHost](https://fadehost.com/deploy-button.svg)](https://laplace.fadehost.com/register?intent=bot&repo=https://github.com/FadeHost/discord-moderation-bot)

Bot Discord pour la modération, les tickets privés et la protection automatique contre les liens indésirables, le spam et les raids.

## Installation
1. Créez une application et un bot dans le [portail développeur Discord](https://discord.com/developers/applications), puis récupérez son jeton.
2. Dans **Bot > Privileged Gateway Intents**, activez **Server Members Intent** et **Message Content Intent**.
3. Invitez le bot avec les portées `bot` et `applications.commands`, ainsi que les permissions nécessaires : **View Channels**, **Send Messages**, **Read Message History**, **Embed Links**, **Attach Files**, **Manage Server**, **Manage Channels**, **Manage Messages**, **Moderate Members**, **Manage Nicknames**, **Kick Members** et **Ban Members**.
4. Déployez le modèle FadeHost et définissez la variable d’environnement `DISCORD_TOKEN`.
5. Utilisez `/logs salon` pour choisir le salon de journalisation, `/config` pour régler les protections et `/bienvenue configurer` ou `/depart configurer` pour les annonces.
6. Pour activer les tickets, un administrateur configure leur catégorie avec `/ticket setup`.

## Modération
| Commande | Fonction |
|---|---|
| `/aide` | Affiche une liste des commandes disponibles et les permissions générales requises. |
| `/warn user reason` | Consigne un avertissement officiel et en informe le membre par message privé. |
| `/warnings user` | Consulte les avertissements consignés pour un membre. |
| `/clearwarnings user` | Supprime les avertissements consignés pour un membre. |
| `/timeout user minutes [reason]` | Suspend temporairement un membre de la conversation, jusqu’à 28 jours. |
| `/untimeout user` | Met fin à la suspension temporaire d’un membre. |
| `/kick user [reason]` | Exclut un membre du serveur. |
| `/ban user [reason] [delete_days]` | Bannit un membre et peut supprimer ses messages des sept derniers jours au maximum. |
| `/unban retirer user_id [reason]` | Lève le bannissement d’un compte à partir de son identifiant Discord. |
| `/unban liste [page]` | Consulte les comptes bannis, avec 20 résultats par page. |
| `/purge amount [from]` | Supprime jusqu’à 100 messages récents, avec un filtre facultatif par auteur. |
| `/slowmode seconds` | Définit le délai entre deux messages ; `0` désactive le mode lent. |
| `/lock` et `/unlock` | Verrouillent ou déverrouillent l’envoi de messages dans le salon actuel. |
| `/nickname user [nickname] [reason]` | Définit ou réinitialise le pseudonyme d’un membre. |
| `/modlog [channel]` | Définit le salon du journal de modération ; sans salon, le journal est désactivé. |
| `/logs salon channel` | Définit le salon où le bot publie les journaux de modération. |
| `/logs afficher` | Consulte les dix dernières entrées publiées par le bot dans ce salon. |
| `/bienvenue configurer` | Active ou désactive l’annonce d’arrivée, choisit son salon, son texte et une image jointe. |
| `/bienvenue afficher` | Consulte la configuration de l’annonce d’arrivée. |
| `/depart configurer` | Active ou désactive l’annonce de départ, choisit son salon, son texte et une image jointe. |
| `/depart afficher` | Consulte la configuration de l’annonce de départ. |

Pour les annonces, le texte accepte `{user}` (mention du membre accueilli), `{username}`, `{server}` et `{memberCount}`. Une image PNG, JPEG, GIF ou WebP de 8 Mo maximum peut être jointe à `/bienvenue configurer` ou `/depart configurer`; le bot la conserve sur son volume de données. Le bot doit avoir la permission d’envoyer des messages et des pièces jointes dans les salons choisis.

## Protection automatique
La commande `/config` est réservée aux membres disposant de **Manage Server**.

| Commande | Paramètres |
|---|---|
| `/config afficher` | Consulte la langue et les paramètres des trois protections automatiques. |
| `/config langue language` | Définit la langue des notifications de sécurité (français ou anglais). |
| `/config antilien actif mode [role_exempt] [effacer_exemption]` | Supprime les invitations Discord ou tous les liens ; peut ajouter ou retirer un rôle exempté. Sans préciser ces options, le rôle déjà configuré est conservé. |
| `/config antispam actif maximum intervalle timeout` | Détecte les envois répétés selon un seuil et une fenêtre configurables, supprime les messages concernés et applique une suspension. |
| `/config antiraid actif seuil intervalle duree` | Détecte une arrivée massive et renforce temporairement le niveau de vérification du serveur. |

Les valeurs sont choisies dans les options de chaque commande. Les notifications de détection sont envoyées au salon défini avec `/modlog`. Le mode anti-raid modifie temporairement le niveau de vérification Discord, puis restaure le niveau précédent, y compris après un redémarrage du bot.

## Tickets
| Commande | Fonction |
|---|---|
| `/ticket setup category [support_role]` | Configure la catégorie des tickets et le rôle de l’équipe de support. |
| `/ticket create` | Ouvre un salon privé de support. Un seul ticket ouvert est autorisé par membre. |
| `/ticket close` | Clôture le ticket actuel tout en conservant son historique pour l’équipe. |
| `/ticket add user` | Autorise un membre supplémentaire à consulter et utiliser le ticket actuel. |
| `/ticket remove user` | Retire à un membre son accès au ticket actuel. |

Le bot vérifie la hiérarchie des rôles avant toute action de modération. Pour les filtres automatiques, il doit pouvoir gérer les messages et appliquer des suspensions ; son rôle doit être placé au-dessus des membres concernés. Le mode anti-raid nécessite la permission **Manage Server**.

## Configuration
| Variable | Obligatoire | Description |
|---|---|---|
| `DISCORD_TOKEN` | Oui | Jeton du bot Discord. |
| `MODLOG_CHANNEL_ID` | Non | Salon de journalisation utilisé par défaut. La commande `/modlog` permet de le modifier. |
| `CONFIG_PATH` | Non | Chemin du fichier de configuration persistant. Par défaut : `/data/moderation-config.json`. |

Les avertissements, paramètres et images des annonces sont conservés après redémarrage. Le stockage doit être persistant sur l’hébergeur.
La commande `/config` n’est visible qu’aux membres ayant la permission **Gérer le serveur**. Pour voir ses sous-commandes, saisissez `/config` puis sélectionnez l’action proposée. L’application doit aussi avoir été invitée avec la portée `applications.commands`.
Les commandes sont enregistrées globalement pour tous les serveurs où le bot est installé. Leur propagation peut prendre jusqu’à une heure après le redémarrage.

Projet distribué sous licence MIT.