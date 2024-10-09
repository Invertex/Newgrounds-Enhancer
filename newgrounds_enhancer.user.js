// ==UserScript==
// @name         Newgrounds Enhancer
// @namespace    Invertex.NG
// @version      0.11
// @description  Automatically loads highest quality NG video and enables video download
// @author       Invertex
// @match        https://www.newgrounds.com/portal/view/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=newgrounds.com
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @run-at       document-start
// ==/UserScript==

const dlSVG = '<svg class="ngDlSVG" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="white" d="m 3.9472656,2.0820312 c -0.9135398,0 -0.9135398,1.4375 0,1.4375 H 21 c 0.913541,0 0.913541,-1.4375 0,-1.4375 z m 8.5253904,3.484375 c -0.380641,0 -0.759765,'+
      '0.1798801 -0.759765,0.5390626 V 17.886719 c 0,0.862037 -2.6e-4,1.723988 -0.457032,1.292969 L 5.1660156,14.007812 c -0.4567702,-0.431018 -1.9800328,0.287496 -1.21875,1.00586 l 6.6992184,5.603516 c 1.82708,1.43673 1.827215,1.43673 3.654297,0 L 21,15.013672 c 0.761283,'+
      '-0.718364 -0.609723,-1.580552 -1.21875,-1.00586 l -6.089844,5.171876 c -0.456769,0.431019 -0.457031,-0.430932 -0.457031,-1.292969 V 6.1054688 c 0,-0.3591825 -0.381078,-0.5390626 -0.761719,-0.5390626 z"></path></svg>';

(function() {
    'use strict';
    processPage();
})();

async function processPage(){
    let id = window.location.href.split('/view/')[1];

    let dlInfo = await getVidDownloadInfo(id);
    let embedHeader = await awaitElem(document.body, '#embed_header');
    let shareBtn = await awaitElem(embedHeader, 'span:has(> #share_content)');
    let likeBtn = embedHeader.querySelector('.favefollow-buttons');
    let appendTo = likeBtn != null ? likeBtn : shareBtn;

    let dlBtn = document.createElement("button");
    dlBtn.className = "ngDlBtn";
    dlBtn.innerHTML = dlSVG;
    dlBtn.title = "Download";
    dlBtn.onclick = ()=> {
        dlBtn.setAttribute('downloading', '');
        downloadURL(dlInfo.url,
                    dlInfo.filename,
                    () => { removeButtonEffect(dlBtn);},
                    () => { removeButtonEffect(dlBtn);});
    };
    appendTo.appendChild(dlBtn);
}

function removeButtonEffect(dlBtn)
{
    if(dlBtn?.hasAttribute('downloading'))
    {
        dlBtn?.removeAttribute('downloading');
    }
}

async function getVidDownloadInfo(id)
{
    let vidInfo = await getVideoInfo(id);
    if(vidInfo == null) { return null; }

    let filename = `${vidInfo.author}_${vidInfo.id} - ${vidInfo.title}`;
    return {url: stripVariants(vidInfo), filename: filename};
}

function downloadURL(url, filename, downloadSuccess, downloadFailed)
    {
        const dl = GM_download({
            url: url,
            name: filename,
            onload: () => { downloadSuccess(); },
            onerror: (e) => {downloadFailed(e); },
            ontimeout: (e) => { downloadFailed(e); }
        });

        window.setTimeout(()=> {
            downloadFailed(null);
            dl.abort();
        }, 22000);
    };

function findElem(rootElem, query, observer, resolve)
{
    const elem = rootElem.querySelector(query);
    if (elem != null && elem != undefined)
    {
        observer?.disconnect();
        resolve(elem);
    }
    return elem;
}

async function awaitElem(root, query, obsArguments)
{
    return new Promise((resolve, reject) =>
    {
        if (findElem(root, query, null, resolve)) { return; }
        const rootObserver = new MutationObserver((mutes, obs) => {
            findElem(root, query, obs, resolve);
        });
        rootObserver.observe(root, obsArguments);
    });
}

async function getVideoInfo(videoID)
{
    const resp = await fetch(`https://www.newgrounds.com/portal/video/${videoID}`, {
        "headers": {
            "accept": "application/json, text/javascript, */*; q=0.01",
            "accept-encoding": "gzip, deflate, br, zstd",
            "accept-language": "en-US,en;q=0.9",
            "Dnt": 1,
            "priority": "u=1, i",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-requested-with": "XMLHttpRequest"
        },
        "referrer":  window.location.ref,
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": null,
        "method": "GET",
        "mode": "cors"
    });
    if (!resp.ok) { return null; }
    const vidinfo = await resp.json();
    return vidinfo;
}


//Intercept the Timeline to pre-cache information about tweets and filter out unwanted tweets
var openOpen = unsafeWindow.XMLHttpRequest.prototype.open;
unsafeWindow.XMLHttpRequest.prototype.open = exportFunction(function(method, url)
{
    //url = changeToTwitter(url);
    processXMLOpen(this, method, url);
    openOpen.call(this, method, url);
}, unsafeWindow);


function processXMLOpen(thisRef, method, url)
{
    if (url.includes('.com/portal/video/'))
    {
        thisRef.addEventListener('readystatechange', function (e)
        {
            if (thisRef.readyState === 4)
            {
                let json = JSON.parse(e.target.response);
                if(json)
                {
                    stripVariants(json);
                    console.log(json);
                    Object.defineProperty(thisRef, 'response', { writable: true });
                    Object.defineProperty(thisRef, 'responseText', { writable: true });
                    thisRef.response = thisRef.responseText = JSON.stringify(json);
                }
            }
        });
    }
}

function stripVariants(vidInfo)
{
    if(vidInfo?.sources != null)
    {
        let entries = Object.keys(vidInfo.sources);
        let bestEntry = [];
        let bestRes = 0;
        let bestKey = "";

        for(let i = 0; i < entries.length; i++)
        {
            let key = entries[i];
            let res = parseInt(key.replace('p',''));
            if(res > bestRes)
            {
                bestRes = res;
                bestEntry = vidInfo.sources[key];
                bestKey = key;
            }
        }

        vidInfo.sources = {};
        vidInfo.sources[bestKey] = bestEntry;
        return bestEntry[0].src;
    }
    return "";
}

function addGlobalStyle(css, id)
{
    if(id && document.querySelector('#' + id)) { return; }
    let head, style;
    head = document.getElementsByTagName('head')[0];
    if (!head) { return; }
    style = document.createElement('style');
    style.type = 'text/css';
    if(id) { style.id = id; }
    if (style.styleSheet) {
        style.styleSheet.cssText = css;
    } else
    {
        style.appendChild(document.createTextNode(css));
    }
    head.appendChild(style);
    return style;
}

addGlobalStyle(`.ng-latest-supporter-wide { display: none; }
.ngDlBtn {
  background-color: transparent;
  border: none;
  margin-right: 6px !important;
  margin-left: 8px !important;
}
.ngDlBtn[downloading],.ngDlBtn[disabled] {
  pointer-events: none !important;
}
.ngDlBtn[downloading] > .ngDlSVG {
  pointer-events: none !important;
  background-color: rgba(143, 44, 242, 0.5);
  border-radius: 12px;
  animation-iteration-count: infinite;
  animation-duration: 2s;
  animation-name: dl-animation;
}
.ngDlBtn[downloading] > .ngDlSVG > path,.ngDlBtn[disabled] > .ngDlSVG > path {
    fill: rgba(255,255,255,0.2);
}
.ngDlSVG:hover {
  background-color: rgba(143, 44, 242, 0.5);
  border-radius: 12px;
}
.ngDlSVG:hover {
  background-color: rgba(200, 200, 200, 0.25);
  border-radius: 12px;
}
.ngDlSVG:focus {
  padding-top: 3px;
  padding-bottom: 3px;
}
@keyframes dl-animation
{
    0%
    {
        background-color: cyan;
    }
    33%
    {
        background-color: magenta;
    }
    66%
    {
        background-color: yellow;
    }
    100%
    {
        background-color: cyan;
    }
}
`);
