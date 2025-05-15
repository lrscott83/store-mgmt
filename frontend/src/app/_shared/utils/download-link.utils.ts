export default class DownloadLinkUtils {
  static createAndOpenLink(fileContents: any, contentType: string) {
    var byteCharacters = atob(fileContents);
    var byteNumbers = new Array(byteCharacters.length);
    for (var i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    var byteArray = new Uint8Array(byteNumbers);
    let binaryData = [];
    binaryData.push(byteArray);
    const downloadedFile = new Blob(binaryData, { type: contentType });

    const a = document.createElement('a');
    a.setAttribute('style', 'display:none;');
    document.body.appendChild(a);
    a.download = "certificate";
    a.href = URL.createObjectURL(downloadedFile);
    a.target = '_blank';
    a.click();
    document.body.removeChild(a);
  }

  static createTextFileAndOpenLink(content: string, contentType: string) {
    const downloadedFile = new Blob([content], { type: contentType });
    const a = document.createElement('a');
    a.setAttribute('style', 'display:none;');
    document.body.appendChild(a);
    a.download = "certificate";
    a.href = URL.createObjectURL(downloadedFile);
    a.target = '_blank';
    a.click();
    document.body.removeChild(a);
  }
}