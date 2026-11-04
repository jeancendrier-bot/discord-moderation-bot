# Bot de modération FadeHost

[![Déployer sur FadeHost](https://fadehost.com/deploy-button.svg)](https://laplace.fadehost.com/register?intent=bot&repo=https://github.com/FadeHost/discord-moderation-bot)

Bot Discord pour la modération, les tickets privés et la protection automatique contre les liens indésirables, le spam et les raids.

## Installation
1. Créez une application et un bot dans le [portail développeur Discord](https://discord.com/developers/applications), puis récupérez son jeton.
2. Dans **Bot > Privileged Gateway Intents**, activez **Server Members Intent** et **Message Content Intent**.
3. Invitez le bot avec les portées `bot` et `applications.commands`, ainsi que les permissions nécessaires : **View Channels**, **Send Messages**, **Send Polls**, **Read Message History**, **Embed Links**, **Attach Files**, **Manage Server**, **Manage Roles**, **Manage Channels**, **Manage Messages**, **Moderate Members**, **Manage Nicknames**, **Kick Members** et **Ban Members**.
4. Déployez le modèle FadeHost et définissez la variable d’environnement `DISCORD_TOKEN`.
5. Lancez `/protocol` pour consulter le niveau d’alerte, puis `/config` pour ouvrir les tableaux de réglage.
6. Dans `/config`, choisissez **Tickets** pour configurer et publier le panneau interactif.
7. Configurez les rôles à choix libre avec `/roles ajouter`, puis publiez le panneau avec `/roles publier`.

Lorsqu’il rejoint un serveur, le bot remercie la personne qui l’a ajouté (si elle peut être identifiée dans les journaux d’audit), puis affiche toutes ses commandes slash dans le salon système ou, si celui-ci n’est pas accessible, dans le premier salon textuel où il peut écrire. La permission **View Audit Log** permet d’identifier l’invitant ; sans elle, le bot remercie toute l’équipe sans mentionner quelqu’un par erreur.
À son démarrage, lors d’un arrêt propre et après une perte ou une reconnexion à Discord, le bot annonce son état uniquement sur le serveur support [discord.gg/FXbeGGyVn](https://discord.gg/FXbeGGyVn), dans le salon défini depuis le tableau **Logs** de `/config` (ou dans le salon système/un salon accessible si aucun salon de logs n’est défini). Les alertes de nouvelle version et les alertes anti-raid graves sont également relayées sur ce serveur support uniquement. Les détections anti-spam et anti-liens restent dans les logs du serveur concerné pour éviter de transmettre des données de modération d’un serveur à un autre. Un arrêt brutal du processus ou de la machine ne permet pas au bot d’envoyer un dernier message.

## Modération
| Commande | Fonction |
|---|---|
| `/aide` | Guide privé paginé : toutes les commandes, avec leurs descriptions, paramètres, actions et permissions requises. |
| `/warn user reason` | Consigne un avertissement officiel et en informe le membre par message privé. |
| `/warnings user [page]` | Consulte le dossier des avertissements (10 par page ; affiche la page la plus récente par défaut). |
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
| `/support` | Présente les principales protections et outils du bot, crédite ses créateurs et fournit un bouton vers le support officiel. Pour faciliter le diagnostic, indiquez la commande concernée et le message d’erreur ; ne partagez jamais votre jeton. |
| `/sondage question choix1 choix2 duree [choix3] [choix4] [choix5]` | Publie un sondage natif Discord dans le salon actuel ; durée de 1 à 768 heures. Le bot doit avoir **Send Polls**. |
Pour rejoindre un salon vocal, le bot a besoin des permissions **Voir le salon** et **Se connecter**. La commande `/vocal` est réservée aux membres ayant **Gérer le serveur** ; le bot reste silencieux et n’émet aucun son. Il reste dans le salon tant que `/vocal quitter` n’a pas été utilisée. Le salon choisi est conservé dans la configuration persistante : le bot tente de le rejoindre à son démarrage et de rétablir la connexion après une interruption. Utilisez `/vocal quitter` pour désactiver cette reconnexion. Si le bot ou l’hébergeur est arrêté, il ne peut pas rester connecté pendant l’arrêt ; il reviendra au prochain démarrage.

Pour les annonces, le texte accepte `{user}` (mention du membre accueilli), `{username}`, `{server}` et `{memberCount}`. Ouvrez `/config`, puis choisissez **Bienvenue** ou **Départ** pour régler le salon, le texte, l’activation, le ping et l’aperçu. Pour joindre ou retirer une image, lancez `/config` avec l’option `annonce` correspondante, puis `image` ou `effacer_image`.

## Protection automatique
Les commandes de configuration sont réservées aux membres ayant la permission **Gérer le serveur**. Le panneau `/config` est utilisable uniquement par la personne qui l’a ouvert. Ses boutons donnent accès à un tableau dédié pour l’anti-raid, l’anti-spam, les liens, le filtre de mots, les annonces de bienvenue et de départ, la langue, les logs (y compris les dix dernières entrées), la vérification CAPTCHA, les tickets et la création d’un tableau de rôles personnalisé. Dans ce dernier, ajoutez des rôles et leurs libellés, modifiez le titre et publiez le panneau dans le salon actuel ; chaque panneau peut proposer jusqu’à 25 rôles. Chaque tableau possède ses propres contrôles et enregistre les changements immédiatement. Les panneaux publics de tickets, rôles et CAPTCHA restent utilisables par les membres concernés. `/protocol` reste disponible comme raccourci direct et se trouve aussi dans le menu `/config` : il affiche les incidents des dernières 24 heures, les protections actives et le niveau d’alerte. 🔴 indique qu’une protection anti-raid est active, 🟠 au moins cinq incidents, 🟡 une protection désactivée ou un incident récent, et 🟢 aucun problème détecté. Le filtre de mots supprime automatiquement les messages concernés ; gérez sa liste depuis le tableau **Filtre de mots** de `/config`.

| Commande | Paramètres |
|---|---|
| `/protocol` | Tableau de suivi : niveau d’alerte, incidents récents et nombre de protections actives. |
| `/config` | Ouvre les boutons vers le protocole et les tableaux de protection, annonces, langue, logs, CAPTCHA, filtre de mots, tickets et tableau de rôles personnalisé. Les images se gèrent avec les options `annonce`, `image` et `effacer_image`. |
| `/roles ajouter role nom` | Ajoute un rôle au panneau public avec un libellé explicite, sans emoji. |
| `/roles retirer role` | Retire le rôle du panneau ; cela ne retire pas ce rôle aux membres qui l’ont déjà. |
| `/roles publier` | Publie dans le salon actuel un panneau où les membres peuvent cliquer pour prendre ou retirer plusieurs rôles. |

Les modifications sont enregistrées immédiatement et la configuration des rôles est indépendante sur chaque serveur où le bot est installé. Le bot doit avoir **Gérer les rôles** et chaque rôle du panneau doit être placé sous son rôle le plus élevé. Le panneau affiche les rôles avec des libellés texte explicites et sans emojis. Choisissez un salon textuel dans **Logs** de `/config` pour y recevoir les commandes slash (sans leurs arguments), les sanctions et détections, ainsi que les principaux événements du serveur : messages modifiés/supprimés, changements de rôles des membres, création/modification/suppression de rôles et de salons, arrivées/départs, bannissements, invitations et activité vocale. Les messages modifiés ou supprimés peuvent inclure leur contenu dans les logs ; le bot doit disposer des permissions nécessaires pour consulter le salon et y envoyer des messages. Le mode anti-raid modifie temporairement le niveau de vérification Discord, puis restaure le niveau précédent, y compris après un redémarrage du bot.

Les alertes anti-raid graves et les échecs de restauration de la protection sont aussi relayés au salon support. Si une nouvelle vague d’arrivées dépasse le seuil pendant une protection anti-raid active, sa durée est prolongée et un événement est ajouté aux logs du serveur, sans publier une nouvelle alerte support à chaque arrivée. Les logs détaillés de spam et de liens restent propres à chaque serveur.

`/aide` guide les nouveaux membres : il explique comment utiliser les commandes, affiche leur description, leurs paramètres et les permissions requises, et permet d’ouvrir une fiche par commande. Le catalogue est paginé et sans catégories. Les panneaux `/aide` et `/config` sont visibles par tout le serveur, mais seul leur auteur peut utiliser les boutons et menus ; les tentatives des autres membres reçoivent un refus privé. Les réponses liées aux actions sensibles de modération restent privées ou visibles selon leur comportement prévu. Lorsqu’il rejoint un serveur, le bot remercie la personne qui l’a ajouté et l’invite à lancer `/aide`. Les tableaux de réglage s’ouvrent depuis `/config` en choisissant le bouton correspondant. Les réponses et panneaux utilisent des libellés explicites plutôt que des emojis décoratifs ; des cercles de couleur indiquent les états utiles (vert pour une réussite, rouge pour une option désactivée, orange pour un avertissement et bleu pour une information). Les commandes de jeux et de tirage au sort ont été retirées.

### Vérification CAPTCHA des nouveaux membres

1. Créez un rôle, par exemple **Vérifié**, et placez-le sous le rôle du bot. Accordez au bot **Gérer les rôles**.
2. Dans les permissions des salons, laissez le salon de vérification visible à `@everyone` et réservez les autres salons aux membres portant le rôle **Vérifié**.
3. Lancez `/config`, choisissez **Vérification**, sélectionnez le rôle, activez la protection, puis cliquez sur **Publier le panneau ici** dans le salon accessible aux nouveaux membres.
4. Les nouveaux membres cliquent sur le panneau, reçoivent une image privée et saisissent les six caractères dans le formulaire. Le code expire après cinq minutes et cinq réponses incorrectes obligent à recommencer.

Le CAPTCHA limite les inscriptions automatisées simples, mais n’est pas une protection absolue contre des services automatisés capables de reconnaître des images. L’activation de la commande ne modifie pas les permissions des salons : configurez bien l’accès avec le rôle **Vérifié**. La configuration doit être stockée sur un volume persistant.

## Tickets
| Commande | Fonction |
|---|---|
| Bouton **Tickets** dans `/config` | Configure et publie le panneau interactif avec un bouton d’ouverture et un formulaire de demande. |
| Bouton « Ouvrir un ticket » | Ouvre un formulaire privé demandant le sujet et les détails ; crée ensuite un salon visible par le demandeur et l’équipe. |
| Bouton « Clôturer le ticket » | Permet au demandeur ou à l’équipe autorisée de clôturer le ticket depuis son salon. |

Le bot vérifie la hiérarchie des rôles avant toute action de modération. Pour les filtres automatiques, il doit pouvoir gérer les messages et appliquer des suspensions ; son rôle doit être placé au-dessus des membres concernés. Le mode anti-raid nécessite la permission **Manage Server**.
Pour activer les tickets, ouvrez `/config`, puis choisissez **Tickets** : sélectionnez la catégorie et le rôle support, modifiez le texte, prévisualisez puis publiez le panneau dans le salon actuel. Les membres ouvrent et clôturent leurs demandes avec les boutons du panneau et du ticket. Le bot doit disposer de **Manage Channels**, **View Channels**, **Send Messages**, **Read Message History** et **Embed Links**.

## Configuration
| Variable | Obligatoire | Description |
|---|---|---|
| `DISCORD_TOKEN` | Oui | Jeton du bot Discord. |
| `MODLOG_CHANNEL_ID` | Non | Salon utilisé par défaut pour les logs ; le tableau **Logs** de `/config` permet de le modifier. |
| `CONFIG_PATH` | Non | Chemin du fichier de configuration persistant. Par défaut : `/data/moderation-config.json`. |

Les avertissements, paramètres et images des annonces sont conservés après redémarrage. Le stockage doit être persistant sur l’hébergeur.
L’application doit aussi avoir été invitée avec la portée `applications.commands`.
Les commandes sont enregistrées globalement pour tous les serveurs où le bot est installé. Leur propagation peut prendre jusqu’à une heure après le redémarrage.

Projet distribué sous licence MIT.