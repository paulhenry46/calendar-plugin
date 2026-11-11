# Calendar Plugin
This plugin is in beta stage.
## Features
### Features in 1.0.0
- create, read, update, delete encrypted events.
- no need to another passphrase : when you unlock the pgp key associated to the account of the event, the event can be decrypted.
### Roadmap
#### 1.0.1
1. When user create a recrusive event, the plugin create all others events. Indeed, we don't want to let the server do this. recursuve event and normal events hsould seem same.
2. If messaging is enabled for an event, we will not encrypt date/time data : we will warn the user about this. To message the user, the server need to know when, so we don't have choice.
#### 1.0.2
3. If the event is encryptped, show a lock icon next to the title
### How does this compare with Proton Calendar ?
| Event Property | Proton Calendar | Calendar Plugin |
| --- | --- | --- |
| **Start/End Time & Time Zone Information** | 🟢 Plaintext | 🔒 Encrypted* |
| **Repetition Rule (RRULE) & Exclusions** | 🟢 Plaintext  | 🔒 Encrypted |
| **Unique Event Identifier (UID)** | 🟢 Plaintext | 🟢 Plaintext |
| **Alarm / Reminder Time Information** | 🟢 Plaintext | 🟢 Plaintext |
| **Title, Description, Location, Attendees** | 🔒 Encrypted | 🔒 Encrypted |

*If users want to be messaged by the server to remind them the event, this information is not encrypted because the server need to know when the event happen. But this is encrypted by default.

We used [this page](https://proton.me/blog/protoncalendar-security-model) for Proton model.
### Recurrence

The server never stores a repetition rule, because it would reveal the rhythm of your events. Instead, when you make an event repeat, the plugin creates **one separate, fully encrypted event for each occurrence**.

- **Each occurrence is independent.** Editing or deleting one occurrence does not affect the others. As a consequences, there is no "edit the whole series" option.
- **Up to 366 occurrences** are created. If you set no end date and no count, occurrences are created for the next **2 years**.
- **An end date is inclusive**: an event repeating until a given day includes that day.
- **Alerts are not copied to occurrences** (see below).

### Alerts

The server is the one that triggers alerts, so it has to know when your event happens and what it is called. An event with alerts therefore cannot be fully encrypted: it becomes **partially encrypted**. The title and start/end date/time are visible to server. Everything else stays encrypted.

Before an event with alerts is saved, you are asked to confirm that its title, date and time will be stored in clear text on the server. If you decline, the event is not saved.

| Action | Result |
| --- | --- |
| Add an alert to a fully encrypted event | The event becomes partially encrypted, after you confirm |
| Edit an alert on a partially encrypted event | It stays partially encrypted |
| Edit the title, date or time of a partially encrypted event | It stays partially encrypted, and the new values are visible to the server |
| Remove an alert while others remain | It stays partially encrypted |
| Remove the last alert | The event is fully encrypted again |


Alerts are not supported on generated occurrences, this is a bulwark limitation. When you create a recurring event with alerts:

- only the **first event** keeps its alerts and becomes partially encrypted;
- the other occurrences stay **fully encrypted and have no alerts**;
- you must **add alerts individually to each occurrence** you want to be notified about. Each occurrence you add an alert to becomes partially encrypted, and you are asked to confirm each time.

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