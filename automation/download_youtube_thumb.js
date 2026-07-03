const fs = require('fs');
const path = require('path');
const https = require('https');

const imageUrl = 'https://i9.ytimg.com/vi/q85bezYSUrM/hqdefault.jpg?sqp=CJS2t9EG&rs=AOn4CLBKLgY0m5sL2AOy5s8TDm1GS994qw';
const dest = 'c:\\Users\\heliu\\Desktop\\WebSItes\\faceless-youtube-creator-clean\\The Saints\\assets\\temp_downloaded_thumb.jpg';

const file = fs.createWriteStream(dest);
https.get(imageUrl, function(response) {
  response.pipe(file);
  file.on('finish', function() {
    file.close();
    console.log('Download complete!');
  });
}).on('error', function(err) {
  fs.unlink(dest, () => {});
  console.error('Error downloading:', err.message);
});
