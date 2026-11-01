# Bot de modération FadeHost

[![Déployer sur FadeHost](https://fadehost.com/deploy-button.svg)](https://laplace.fadehost.com/register?intent=bot&repo=https://github.com/FadeHost/discord-moderation-bot)

Bot Discord pour la modération, les tickets privés et la protection automatique contre les liens indésirables, le spam et les raids.

## Installation
1. Créez une application et un bot dans le [portail développeur Discord](https://discord.com/developers/applications), puis récupérez son jeton.
2. Dans **Bot > Privileged Gateway Intents**, activez **Server Members Intent** et **Message Content Intent**.
3. Invitez le bot avec les portées `bot` et `applications.commands`, ainsi que les permissions nécessaires : **View Channels**, **Send Messages**, **Read Message History**, **Embed Links**, **Attach Files**, **Manage Server**, **Manage Channels**, **Manage Messages**, **Moderate Members**, **Manage Nicknames**, **Kick Members** et **Ban Members**.
4. Déployez le modèle FadeHost et définissez la variable d’environnement `DISCORD_TOKEN`.
5. Lancez `/securitas` pour régler l’anti-raid, l’anti-spam et l’anti-liens dans un tableau unique ; utilisez `/config bienvenue` pour les autres réglages.
6. Configurez les tickets avec `/config tickets`, puis publiez leur panneau avec `/ticket panel`.

Lorsqu’il rejoint un serveur, le bot remercie l’équipe dans le salon système ou, si celui-ci n’est pas accessible, dans le premier salon textuel où il peut écrire.
À son démarrage, lors d’un arrêt propre et après une perte ou une reconnexion à Discord, le bot annonce son état uniquement sur le serveur support [discord.gg/FXbeGGyVn](https://discord.gg/FXbeGGyVn), dans le salon défini avec `/config journaux` (ou dans le salon système/un salon accessible si aucun journal n’est défini). Les autres serveurs ne reçoivent pas ces annonces de statut. Un arrêt brutal du processus ou de la machine ne permet pas au bot d’envoyer un dernier message.

## Modération
| Commande | Fonction |
|---|---|
| `/aide` | Affiche une liste des commandes disponibles et les permissions générales requises. |
| `/warn user reason` | Consigne un avertissement officiel et en informe le membre par message privé. |
| `/warnings user` | Consulte les avertissements consignés pour un membre. |
| `/unwarn user number` | Retire un avertissement précis, repéré avec `/warnings`. |
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
| `/vocal rejoindre salon` | Connecte le bot au salon vocal choisi (sans musique ni diffusion audio) et mémorise ce choix pour le prochain démarrage. |
| `/vocal quitter` | Déconnecte le bot et annule les reconnexions automatiques. |
| `/nickname user [nickname] [reason]` | Définit ou réinitialise le pseudonyme d’un membre. |
| `/report user details` | Transmet un signalement privé à l’équipe via le salon configuré dans `/config journaux`. |
| `/logs afficher` | Consulte les dix dernières entrées publiées par le bot dans ce salon. |
| `/panneau-admin` | Affiche un panneau privé « Accès Administrateur » avec un formulaire « Clés d’accès ». Le bot ne vérifie ni ne stocke la clé saisie ; la permission Administrateur de Discord protège la commande. |
| `/giveaway lot duree gagnants [salon]` | Lance un giveaway avec bouton de participation ; réservé aux membres ayant **Gérer le serveur**. La durée va de 1 minute à 7 jours et le nombre de gagnants de 1 à 20. Par défaut, le giveaway est publié dans le salon actuel ; l’option `salon` permet de choisir un salon textuel. |
| `/minijeu` | Ouvre un mini-jeu privé de pierre-feuille-ciseaux contre le bot, accessible à tous. |

Pour rejoindre un salon vocal, le bot a besoin des permissions **Voir le salon** et **Se connecter**. La commande `/vocal` est réservée aux membres ayant **Gérer le serveur** ; le bot reste silencieux et n’émet aucun son. Il reste dans le salon tant que `/vocal quitter` n’a pas été utilisée. Le salon choisi est conservé dans la configuration persistante : le bot tente de le rejoindre à son démarrage et de rétablir la connexion après une interruption. Utilisez `/vocal quitter` pour désactiver cette reconnexion. Si le bot ou l’hébergeur est arrêté, il ne peut pas rester connecté pendant l’arrêt ; il reviendra au prochain démarrage.

Pour les annonces, le texte accepte `{user}` (mention du membre accueilli), `{username}`, `{server}` et `{memberCount}`. Les commandes `/config bienvenue` et `/config depart` ouvrent chacune leurs propres boutons pour choisir le salon, activer l’annonce et modifier le texte. Le bouton d’aperçu envoie une version de test dans le salon d’annonce sans ping. Le ping du nouvel arrivant se règle avec un bouton dans `/config bienvenue`. Pour joindre une image, relancez la commande avec l’option `image`; pour la retirer, choisissez le bouton **Retirer l’image** ou l’option `effacer_image`.

## Protection automatique
Les commandes de configuration sont réservées aux membres disposant de **Gérer le serveur**. `/securitas` rassemble les réglages anti-raid, anti-spam et anti-liens dans un seul tableau privé. Les autres rubriques restent accessibles depuis `/config`.

| Commande | Paramètres |
|---|---|
| `/securitas` | Tableau unique pour activer/désactiver l’anti-raid, l’anti-spam et l’anti-liens ; ajuster les seuils ; choisir le type de liens bloqués et le rôle exempté. |
| `/config langue` | Choisir le français ou l’anglais avec un bouton. |
| `/config verification` | Choisir le rôle accordé après réussite, activer le CAPTCHA et publier un panneau dans le salon actuel. |
| `/config journaux` | Choisir le salon du journal dans un sélecteur ou désactiver le journal. |
| `/config bienvenue` et `/config depart` | Choisir le salon, activer/désactiver, modifier le texte, envoyer un aperçu dans le salon défini ; l’annonce de bienvenue permet aussi de régler le ping. Les options de la commande gèrent l’image. |
| `/config tickets` | Choisir la catégorie et le rôle support, modifier le titre et les instructions, afficher un aperçu ou publier le panneau directement. |

Les modifications sont enregistrées immédiatement. Les notifications de détection sont envoyées dans le salon défini avec `/config journaux`. Le mode anti-raid modifie temporairement le niveau de vérification Discord, puis restaure le niveau précédent, y compris après un redémarrage du bot.

### Vérification CAPTCHA des nouveaux membres

1. Créez un rôle, par exemple **Vérifié**, et placez-le sous le rôle du bot. Accordez au bot **Gérer les rôles**.
2. Dans les permissions des salons, laissez le salon de vérification visible à `@everyone` et réservez les autres salons aux membres portant le rôle **Vérifié**.
3. Lancez `/config verification`, sélectionnez le rôle, activez la protection, puis cliquez sur **Publier le panneau ici** dans le salon accessible aux nouveaux membres.
4. Les nouveaux membres cliquent sur le panneau, reçoivent une image privée et saisissent les six caractères dans le formulaire. Le code expire après cinq minutes et cinq réponses incorrectes obligent à recommencer.

Le CAPTCHA limite les inscriptions automatisées simples, mais n’est pas une protection absolue contre des services automatisés capables de reconnaître des images. L’activation de la commande ne modifie pas les permissions des salons : configurez bien l’accès avec le rôle **Vérifié**. La configuration doit être stockée sur un volume persistant.

## Tickets
| Commande | Fonction |
|---|---|
| `/ticket panel salon [titre] [description]` | Publie un panneau interactif avec un bouton d’ouverture et un formulaire de demande. |
| Bouton « Ouvrir un ticket » | Ouvre un formulaire privé demandant le sujet et les détails ; crée ensuite un salon visible par le demandeur et l’équipe. |
| Bouton « Clôturer le ticket » | Permet au demandeur ou à l’équipe autorisée de clôturer le ticket depuis son salon. |

Le bot vérifie la hiérarchie des rôles avant toute action de modération. Pour les filtres automatiques, il doit pouvoir gérer les messages et appliquer des suspensions ; son rôle doit être placé au-dessus des membres concernés. Le mode anti-raid nécessite la permission **Manage Server**.
Pour activer les tickets, configurez catégorie, rôle support et texte dans le tableau unique `/config tickets`, puis publiez le panneau avec `/ticket panel`. Ce tableau permet aussi de prévisualiser le panneau ou de le publier directement dans le salon actuel. Le bot doit disposer de **Manage Channels**, **View Channels**, **Send Messages**, **Read Message History** et **Embed Links** ; les membres ouvrent et clôturent leurs demandes avec les boutons du panneau et du ticket.

## Configuration
| Variable | Obligatoire | Description |
|---|---|---|
| `DISCORD_TOKEN` | Oui | Jeton du bot Discord. |
| `MODLOG_CHANNEL_ID` | Non | Salon de journalisation utilisé par défaut ; `/config journaux` permet de le modifier. |
| `CONFIG_PATH` | Non | Chemin du fichier de configuration persistant. Par défaut : `/data/moderation-config.json`. |

Les avertissements, paramètres et images des annonces sont conservés après redémarrage. Le stockage doit être persistant sur l’hébergeur.
L’application doit aussi avoir été invitée avec la portée `applications.commands`.
Les commandes sont enregistrées globalement pour tous les serveurs où le bot est installé. Leur propagation peut prendre jusqu’à une heure après le redémarrage.

Projet distribué sous licence MIT.