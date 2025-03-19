document.querySelector('.burger').addEventListener('click', function() {
    this.classList.toggle('is-active');
    const header = document.querySelector('.him-header');
    if (this.classList.contains('is-active')) {
      header.classList.add('active');
      document.body.style.overflow = "hidden";
    } else {
        header.classList.remove('active');    
        document.body.style.overflow = "";
    }  
  });