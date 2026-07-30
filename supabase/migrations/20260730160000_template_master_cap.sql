-- Master ODL del template: anche il CAP si autocompila dall'ODL.
-- Le estrazioni per comune portano la colonna CAP: si conserva sulle righe master
-- e finisce nel foglio MasterODL (il template compila la colonna CAP come le altre).
-- Lo snapshot DUNNING dell'agente non ha CAP: per quegli ODL resta vuoto.
alter table template_master_righe add column if not exists cap text;
