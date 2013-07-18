myparent(fred, bob).
myparent(john, tony).
myparent(cynthia, bob).
mychild(X,Y) :- myparent(Y,X).
