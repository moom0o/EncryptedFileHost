# EncryptedFileHost
![NodeJS](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-Middleware-000000?style=for-the-badge&logo=express&logoColor=white)
![AES-256](https://img.shields.io/badge/Security-AES_256_CBC-red?style=for-the-badge&logo=auth0&logoColor=white)

Encrypt files or images in AES 256
Running in prod on https://i.moomoo.me

```mermaid
graph TD
    %% --- Pipeline 1: Secure Upload ---
    subgraph "Phase 1: Secure Ingestion (Encryption)"
    UserUp[User] -->|1. Upload File + Password| EncryptModule[AES-256]
    
    EncryptModule -->|2. Encrypt Bytes| Storage[(Encrypted File Store)]
    
    
    end

    %% --- Pipeline 2: Secure Download ---
    subgraph "Image Retrieval Decryption"
    UserDown[User] -->|1. Request ID + Password| API_Down[GET /decrypt]
    API_Down --> CheckExist{File Exists?}
    
    %% Error 404 Path
    CheckExist --No--> Err404[Error 404: Not Found]
    
    %% Success Path
    CheckExist --Yes--> Fetch[Fetch Encrypted Blob]

    Fetch -->Storage
    Storage -->|3. Load Data| DecryptModule[AES-256 Decrypt]
    
    DecryptModule -->|4. Attempt Decrypt| Check{Integrity Check?}
    
    Check --Success--> Stream[Stream Decrypted File]
    Check --Fail/Bad Password--> Error[Error 500: Decryption Failed]
    end
```

## What is this?
This service is a free (for now) encrypted file/image host. Files are encrypted with AES 256 then compressed with GZIP. No one can read your files without the encryption key, not even me.

Even if the servers were hacked no one would be able to see file contents unless AES 256 is somehow cracked in the future.

This is a fun project that I will try to keep free, however if it uses too much storage I may have to create restrictions.

Please note this service is NOT intended to be used for breaking the law. I only really made this to prevent others from eavesdropping on my images/files that could contain personal information or even credit cards.
(copy and pasted)

## How-To
Here's how to start everything
1. Clone this repo
2. Make a folder in the root directory called "files" (without the quotes)
3. Do 'npm install'
4. Then do 'node .'
5. Done!

## Credits
* **Backend & Architecture:** [moom0o](https://github.com/moom0o) - *API Design, Encryption, Client-Side interactions.*
* **UI/UX:** [Win](https://github.com/WinsDominoes) - *Visual design, CSS*

