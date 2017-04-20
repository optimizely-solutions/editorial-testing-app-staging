$(document).ready(function($) {
  var close = document.getElementById("close");
  if (close){
    close.addEventListener('click', function() {
     note = document.getElementById("note");
     note.style.display = 'none';
    }, false);
  }
});

