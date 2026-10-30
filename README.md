# Bot de modération FadeHost

[![Déployer sur FadeHost](https://fadehost.com/deploy-button.svg)](https://laplace.fadehost.com/register?intent=bot&repo=https://github.com/FadeHost/discord-moderation-bot)

Bot Discord pour la modération, les tickets privés et la protection automatique contre les liens indésirables, le spam et les raids.

## Installation
1. Créez une application et un bot dans le [portail développeur Discord](https://discord.com/developers/applications), puis récupérez son jeton.
2. Dans **Bot > Privileged Gateway Intents**, activez **Server Members Intent** et **Message Content Intent**.
3. Invitez le bot avec les portées `bot` et `applications.commands`, ainsi que les permissions nécessaires : **View Channels**, **Send Messages**, **Read Message History**, **Embed Links**, **Attach Files**, **Manage Server**, **Manage Channels**, **Manage Messages**, **Moderate Members**, **Manage Nicknames**, **Kick Members** et **Ban Members**.
4. Déployez le modèle FadeHost et définissez la variable d’environnement `DISCORD_TOKEN`.
5. Utilisez `/config panneau` pour ouvrir le centre privé qui regroupe les protections, journaux, annonces et réglages des tickets.
6. Pour publier un panneau de tickets, configurez sa catégorie dans `/config panneau`, puis utilisez `/ticket panel`.

Lorsqu’il rejoint un serveur, le bot remercie l’équipe dans le salon système ou, si celui-ci n’est pas accessible, dans le premier salon textuel où il peut écrire.

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
| `/dire message [salon]` | Publie un message au nom du bot ; les mentions sont désactivées et la commande nécessite **Gérer les messages**. |
| `/vocal rejoindre salon` | Connecte le bot au salon vocal choisi (sans musique ni diffusion audio). |
| `/vocal quitter` | Déconnecte le bot du salon vocal actuel. |
| `/nickname user [nickname] [reason]` | Définit ou réinitialise le pseudonyme d’un membre. |
| `/logs afficher` | Consulte les dix dernières entrées publiées par le bot dans ce salon. |

Pour rejoindre un salon vocal, le bot a besoin de la permission **Se connecter**. La commande `/vocal` est réservée aux membres ayant **Gérer le serveur** ; le bot reste silencieux et n’émet aucun son.

Pour les annonces, le texte accepte `{user}` (mention du membre accueilli), `{username}`, `{server}` et `{memberCount}`. Le panneau règle le salon, le texte, l’activation et le ping. Pour joindre ou retirer une image, utilisez les sous-commandes `/config bienvenue` ou `/config depart`; le fichier est conservé sur le volume de données du bot.

## Protection automatique
La commande `/config` est réservée aux membres disposant de **Gérer le serveur**. Pour retrouver les réglages au même endroit, utilisez `/config panneau` : le menu permet de naviguer entre les catégories, les salons et rôles se choisissent dans des listes Discord, et les formulaires servent à régler les valeurs détaillées.

| Commande | Paramètres |
|---|---|
| `/config panneau` | Ouvre le centre de configuration privé et esthétique : protections, journaux, annonces et tickets, avec rubriques, boutons, sélecteurs de salon/rôle et formulaires. |
| `/config afficher` | Consulte les paramètres des protections automatiques. |
| `/config langue`, `/config antilien`, `/config antispam`, `/config antiraid` | Raccourcis directs conservés pour modifier les protections sans ouvrir le panneau. |
| `/config bienvenue` et `/config depart` | Gèrent aussi les images personnalisées des annonces depuis la même commande `/config`. |

Les notifications de détection sont envoyées au salon choisi dans la rubrique **Journaux**. Le mode anti-raid modifie temporairement le niveau de vérification Discord, puis restaure le niveau précédent, y compris après un redémarrage du bot.

## Tickets
| Commande | Fonction |
|---|---|
| `/ticket panel salon [titre] [description]` | Publie un panneau interactif avec un bouton d’ouverture et un formulaire de demande. |
| Bouton « Ouvrir un ticket » | Ouvre un formulaire privé demandant le sujet et les détails ; crée ensuite un salon visible par le demandeur et l’équipe. |
| Bouton « Clôturer le ticket » | Permet au demandeur ou à l’équipe autorisée de clôturer le ticket depuis son salon. |
| `/ticket create` | Ouvre un ticket privé sans formulaire. Un seul ticket ouvert est autorisé par membre. |
| `/ticket close` | Clôture le ticket actuel tout en conservant son historique pour l’équipe. |
| `/ticket add user` | Autorise un membre supplémentaire à consulter et utiliser le ticket actuel. |
| `/ticket remove user` | Retire à un membre son accès au ticket actuel. |

Le bot vérifie la hiérarchie des rôles avant toute action de modération. Pour les filtres automatiques, il doit pouvoir gérer les messages et appliquer des suspensions ; son rôle doit être placé au-dessus des membres concernés. Le mode anti-raid nécessite la permission **Manage Server**.
Pour activer le panneau, un administrateur choisit d’abord la catégorie et le rôle support dans `/config panneau`, puis publie le panneau dans un salon accessible avec `/ticket panel`. Le bot doit disposer de **Manage Channels**, **View Channels**, **Send Messages**, **Read Message History** et **Embed Links** ; les membres peuvent ouvrir le formulaire via le bouton.

## Configuration
| Variable | Obligatoire | Description |
|---|---|---|
| `DISCORD_TOKEN` | Oui | Jeton du bot Discord. |
| `MODLOG_CHANNEL_ID` | Non | Salon de journalisation utilisé par défaut ; le centre `/config panneau` permet de le modifier. |
| `CONFIG_PATH` | Non | Chemin du fichier de configuration persistant. Par défaut : `/data/moderation-config.json`. |

Les avertissements, paramètres et images des annonces sont conservés après redémarrage. Le stockage doit être persistant sur l’hébergeur.
L’application doit aussi avoir été invitée avec la portée `applications.commands`.
Les commandes sont enregistrées globalement pour tous les serveurs où le bot est installé. Leur propagation peut prendre jusqu’à une heure après le redémarrage.

Projet distribué sous licence MIT.