export default class DownloadLinkUtils {
  static createAndOpenLink(fileContents: any, contentType: string) {
    const byteCharacters = atob(fileContents);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const binaryData = [];
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