(function(){
  var t=document.querySelector('.menu-toggle'),s=document.querySelector('.sidebar');
  if(t&&s){t.addEventListener('click',function(){var o=s.classList.toggle('open');t.setAttribute('aria-expanded',o?'true':'false');});}
  document.querySelectorAll('form[data-confirm]').forEach(function(f){
    f.addEventListener('submit',function(e){if(!window.confirm(f.getAttribute('data-confirm')))e.preventDefault();});
  });
  var dirty=false,flag=document.querySelector('[data-dirty-flag]');
  document.querySelectorAll('form[data-dirty-watch]').forEach(function(f){
    var mark=function(e){if(e.target.id==='actor-filter')return;dirty=true;if(flag)flag.classList.remove('hidden');};
    f.addEventListener('input',mark);f.addEventListener('change',mark);
    f.addEventListener('submit',function(){dirty=false;});
  });
  window.addEventListener('beforeunload',function(e){if(dirty){e.preventDefault();e.returnValue='';}});
  var filt=document.getElementById('actor-filter');
  if(filt){filt.addEventListener('input',function(){
    var q=filt.value.trim().toLowerCase(),n=0;
    document.querySelectorAll('tr[data-actor]').forEach(function(r){
      var m=!q||r.getAttribute('data-actor').indexOf(q)!==-1;r.hidden=!m;if(m)n++;
    });
    var c=document.getElementById('actor-filter-count');if(c)c.textContent=n+' shown';
  });}
  var reload=document.querySelector('[data-reload-seconds]');
  if(reload){setTimeout(function(){if(!dirty)location.reload();},parseInt(reload.getAttribute('data-reload-seconds'),10)*1000);}
})();
