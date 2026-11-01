# Bot de modération FadeHost

[![Déployer sur FadeHost](https://fadehost.com/deploy-button.svg)](https://laplace.fadehost.com/register?intent=bot&repo=https://github.com/FadeHost/discord-moderation-bot)

Bot Discord pour la modération, les tickets privés et la protection automatique contre les liens indésirables, le spam et les raids.

## Installation
1. Créez une application et un bot dans le [portail développeur Discord](https://discord.com/developers/applications), puis récupérez son jeton.
2. Dans **Bot > Privileged Gateway Intents**, activez **Server Members Intent** et **Message Content Intent**.
3. Invitez le bot avec les portées `bot` et `applications.commands`, ainsi que les permissions nécessaires : **View Channels**, **Send Messages**, **Send Polls**, **Read Message History**, **Embed Links**, **Attach Files**, **Manage Server**, **Manage Channels**, **Manage Messages**, **Moderate Members**, **Manage Nicknames**, **Kick Members** et **Ban Members**.
4. Déployez le modèle FadeHost et définissez la variable d’environnement `DISCORD_TOKEN`.
5. Lancez `/securitas` pour configurer uniquement les protections anti-raid, anti-spam et anti-liens, puis `/gestion` pour les réglages de bienvenue, départ, langue et journaux.
6. Configurez et publiez le panneau de tickets depuis le tableau interactif `/tickets`.

Lorsqu’il rejoint un serveur, le bot remercie la personne qui l’a ajouté (si elle peut être identifiée dans les journaux d’audit), puis affiche toutes ses commandes slash dans le salon système ou, si celui-ci n’est pas accessible, dans le premier salon textuel où il peut écrire. La permission **View Audit Log** permet d’identifier l’invitant ; sans elle, le bot remercie toute l’équipe sans mentionner quelqu’un par erreur.
À son démarrage, lors d’un arrêt propre et après une perte ou une reconnexion à Discord, le bot annonce son état uniquement sur le serveur support [discord.gg/FXbeGGyVn](https://discord.gg/FXbeGGyVn), dans le salon défini depuis le panneau **Journal de modération** de `/gestion` (ou dans le salon système/un salon accessible si aucun journal n’est défini). Les alertes de nouvelle version et les alertes anti-raid graves sont également relayées sur ce serveur support uniquement. Les détections anti-spam et anti-liens restent dans le journal du serveur concerné pour éviter de transmettre des données de modération d’un serveur à un autre. Un arrêt brutal du processus ou de la machine ne permet pas au bot d’envoyer un dernier message.

## Modération
| Commande | Fonction |
|---|---|
| `/aide` | Ouvre un panneau privé avec les commandes regroupées par catégorie et leurs permissions. |
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
| `/serverinfo` | Affiche le nombre de membres, les salons, la date de création et le propriétaire du serveur. |
| `/userinfo [user]` | Affiche l’identifiant, les dates de compte/arrivée et les rôles d’un membre. |
| `/avatar [user]` | Affiche l’avatar d’un membre en grand et fournit son lien. |
| `/sondage question choix1 choix2 duree [choix3] [choix4] [choix5]` | Publie un sondage natif Discord dans le salon actuel ; durée de 1 à 768 heures. Le bot doit avoir **Send Polls**. |
| `/logs afficher` | Consulte les dix dernières entrées publiées par le bot dans ce salon. |
| `/giveaway lot duree gagnants [salon]` | Lance un giveaway avec bouton de participation ; réservé aux membres ayant **Gérer le serveur**. La durée va de 1 minute à 7 jours et le nombre de gagnants de 1 à 20. Par défaut, le giveaway est publié dans le salon actuel ; l’option `salon` permet de choisir un salon textuel. |
| `/minijeu` | Ouvre un mini-jeu privé de pierre-feuille-ciseaux contre le bot, accessible à tous. |
| `/quiz` | Lance une question privée de culture générale à choix multiples ; une nouvelle question est tirée à chaque utilisation. |
| `/de [nombre] [faces]` | Lance de 1 à 10 dés, avec 2 à 100 faces par dé. |
| `/pileouface` | Tire à pile ou face. |

Pour rejoindre un salon vocal, le bot a besoin des permissions **Voir le salon** et **Se connecter**. La commande `/vocal` est réservée aux membres ayant **Gérer le serveur** ; le bot reste silencieux et n’émet aucun son. Il reste dans le salon tant que `/vocal quitter` n’a pas été utilisée. Le salon choisi est conservé dans la configuration persistante : le bot tente de le rejoindre à son démarrage et de rétablir la connexion après une interruption. Utilisez `/vocal quitter` pour désactiver cette reconnexion. Si le bot ou l’hébergeur est arrêté, il ne peut pas rester connecté pendant l’arrêt ; il reviendra au prochain démarrage.

Pour les annonces, le texte accepte `{user}` (mention du membre accueilli), `{username}`, `{server}` et `{memberCount}`. Dans `/gestion`, choisissez **Bienvenue** ou **Départ** pour ouvrir les boutons de réglage du salon, du texte, de l’activation et de l’aperçu. Le ping du nouvel arrivant se règle dans le panneau **Bienvenue**. Pour joindre ou retirer une image, lancez `/gestion` avec l’option `annonce`, puis l’option `image` ou `effacer_image`.

## Protection automatique
Les commandes de configuration sont réservées aux membres disposant de **Gérer le serveur**. Les panneaux privés de `/aide`, `/securitas`, `/gestion`, `/verification` et `/tickets` ne peuvent être utilisés que par la personne qui les a ouverts. Si un panneau ne reconnaît pas son propriétaire, relancez sa commande. Les panneaux publics de tickets et de CAPTCHA restent utilisables par les membres concernés. `/securitas` affiche uniquement les protections automatiques. `/gestion` affiche les réglages de bienvenue, départ, langue et journaux. `/verification` configure séparément le CAPTCHA ; `/tickets` reste indépendant.

| Commande | Paramètres |
|---|---|
| `/securitas` | Panneau dédié aux protections anti-raid, anti-spam et anti-liens. |
| `/gestion` | Panneau privé de bienvenue, départ, langue et journaux ; options `annonce`, `image` et `effacer_image` pour les images de bienvenue/départ. |
| `/verification` | Panneau indépendant pour configurer la vérification CAPTCHA des nouveaux membres. |
| `/tickets` | Raccourci direct vers le panneau interactif des tickets : catégorie, rôle support, texte, aperçu et publication. |

Les modifications sont enregistrées immédiatement. Les notifications de détection sont envoyées dans le salon défini depuis le panneau **Journal de modération** de `/gestion`. Le mode anti-raid modifie temporairement le niveau de vérification Discord, puis restaure le niveau précédent, y compris après un redémarrage du bot.

Les alertes anti-raid graves et les échecs de restauration de la protection sont aussi relayés au salon support. Les journaux détaillés de spam et de liens restent propres à chaque serveur.

`/aide` regroupe les commandes en quatre panneaux : modération des membres, salons et journaux, configuration et tickets, jeux et animations. Les commandes d’action restent disponibles individuellement dans le menu slash de Discord ; les sous-actions proches comme `/unban retirer` et `/unban liste` restent réunies sous `/unban`.

### Vérification CAPTCHA des nouveaux membres

1. Créez un rôle, par exemple **Vérifié**, et placez-le sous le rôle du bot. Accordez au bot **Gérer les rôles**.
2. Dans les permissions des salons, laissez le salon de vérification visible à `@everyone` et réservez les autres salons aux membres portant le rôle **Vérifié**.
3. Lancez `/verification`, sélectionnez le rôle, activez la protection, puis cliquez sur **Publier le panneau ici** dans le salon accessible aux nouveaux membres.
4. Les nouveaux membres cliquent sur le panneau, reçoivent une image privée et saisissent les six caractères dans le formulaire. Le code expire après cinq minutes et cinq réponses incorrectes obligent à recommencer.

Le CAPTCHA limite les inscriptions automatisées simples, mais n’est pas une protection absolue contre des services automatisés capables de reconnaître des images. L’activation de la commande ne modifie pas les permissions des salons : configurez bien l’accès avec le rôle **Vérifié**. La configuration doit être stockée sur un volume persistant.

## Tickets
| Commande | Fonction |
|---|---|
| `/tickets` | Configure et publie le panneau interactif avec un bouton d’ouverture et un formulaire de demande. |
| Bouton « Ouvrir un ticket » | Ouvre un formulaire privé demandant le sujet et les détails ; crée ensuite un salon visible par le demandeur et l’équipe. |
| Bouton « Clôturer le ticket » | Permet au demandeur ou à l’équipe autorisée de clôturer le ticket depuis son salon. |

Le bot vérifie la hiérarchie des rôles avant toute action de modération. Pour les filtres automatiques, il doit pouvoir gérer les messages et appliquer des suspensions ; son rôle doit être placé au-dessus des membres concernés. Le mode anti-raid nécessite la permission **Manage Server**.
Pour activer les tickets, ouvrez le tableau unique `/tickets` : choisissez la catégorie et le rôle support, modifiez le texte, prévisualisez puis publiez le panneau dans le salon actuel. Les membres ouvrent et clôturent leurs demandes avec les boutons du panneau et du ticket. Le bot doit disposer de **Manage Channels**, **View Channels**, **Send Messages**, **Read Message History** et **Embed Links**.

## Configuration
| Variable | Obligatoire | Description |
|---|---|---|
| `DISCORD_TOKEN` | Oui | Jeton du bot Discord. |
| `MODLOG_CHANNEL_ID` | Non | Salon de journalisation utilisé par défaut ; le panneau **Journal de modération** de `/gestion` permet de le modifier. |
| `CONFIG_PATH` | Non | Chemin du fichier de configuration persistant. Par défaut : `/data/moderation-config.json`. |

Les avertissements, paramètres et images des annonces sont conservés après redémarrage. Le stockage doit être persistant sur l’hébergeur.
L’application doit aussi avoir été invitée avec la portée `applications.commands`.
Les commandes sont enregistrées globalement pour tous les serveurs où le bot est installé. Leur propagation peut prendre jusqu’à une heure après le redémarrage.

Projet distribué sous licence MIT.