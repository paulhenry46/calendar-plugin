# Calendar Plugin
This plugin is in beta stage.
## Current Features
- create, read, update, delete encrypted events.
- no need to another passphrase : when you unlock the pgp key associated to the account of the event, the event can be decrypted
## Roadmap
- better handling of recursive events : for instance, we can imagine develop such event and send them to server. This way, they appears in calendar. Howerver, we loose the link with master event and childs.
- UI slot to show event is encrypted
## Compatibilty
This plugin needs one of these PGP Plugins to work :
- PGP True End to End
- Aurion PGP
## Architecture
We choose to rely on a master plugin for managing the keys. This master plugin can be PGP True End to End or Aurion PGP. This master plugin can share to child plugin, here the calendar plugin, keys and a passphrase derivated from master passphrase. Data stored by plugin is transfered to master Plugin and written to its indexedDB. As a result, the calendar PGP plugin doen't write anything on disk. This is delegated to master plugin which write per-account data, for instance :
```
user@aurionmail.org@mail.aurionmail.org :  {iv: 'vxKMz2zIjgB/OarM', wrappedKeys: 'olqB1i3s5qZlbTYMc56mhoNXDV8x6gvdd62FQXUGHoYB1QTzqT/63XG1Joori989p94i62t51cqrzPZijmkAIq68fsVd/YElLkpA1Fr6sAXrwB+/26BFhDAysWjl2oxkkp3U8Nvd0WmGF6OnkW4DAdI3+ZS9Yj20pu4oD0DhGNhweyZDCf3JXZuPPIp4qRkt4sMEvUO3uAZ9Qyy/uo4plh6q5m8uyeJ2p+LJyC/a'}
```
### How it works ?
1. When installing this plugin, it ask the master plugin if it has data, i.e. the calendar keys for the account.
2. If no, master answer only with a derivated secret from passphrase : calendar plugin generate keys, encrypt themn with received secret and send them to master plugin.
3. master plugin encrypt them with a passphrase derivated from master passphrase
4. when the calendar plugin asked once again, the data exists : master plugin answers with this encrypted data and the derivated master passphrase

This is why this plugin want to access to `crypto:full` and privileged tier : it wants to communicate to the master plugin throught iframes.