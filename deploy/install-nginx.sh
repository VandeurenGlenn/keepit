#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

adopt=false
force_reload=false
for option in "$@"; do
  case "$option" in
    --adopt) adopt=true ;;
    --reload) force_reload=true ;;
    -h|--help)
      echo "Gebruik: sudo bash deploy/install-nginx.sh [--adopt] [--reload]"
      echo "--adopt: vervang een bestaande, niet-beheerde keepit.conf en bewaar de oude versie."
      echo "--reload: herlaad ook als het bestand op schijf al overeenkomt."
      exit 0 ;;
    *) echo "Onbekende optie: $option" >&2; exit 2 ;;
  esac
done

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source_conf="$script_dir/nginx/keepit.conf"
config_dir="${KEEPIT_NGINX_CONF_DIR:-/etc/nginx/conf.d}"
target="$config_dir/keepit.conf"
marker='# Managed by Keepit (deploy/install-nginx.sh)'

if [[ ! -r "$source_conf" || ! -d "$config_dir" ]]; then
  echo 'De Keepit-config of nginx-configmap ontbreekt. Installeer nginx en controleer de configuratiemap.' >&2
  exit 1
fi
for executable in nginx systemctl flock; do
  if ! command -v "$executable" >/dev/null; then
    echo "Vereist commando ontbreekt: $executable" >&2
    exit 1
  fi
done

umask 077
exec 9>"$config_dir/.keepit-nginx.lock"
if ! flock -n 9; then
  echo 'Er loopt al een installatie van de Keepit-nginx-config.' >&2
  exit 1
fi

if [[ -L "$target" || ( -e "$target" && ! -f "$target" ) ]]; then
  echo "Niet gewijzigd: $target is geen gewoon bestand." >&2
  exit 1
fi

candidate=''
backup=''
dump=''
diagnostics=''
switched=false
reload_attempted=false
applied=false

cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$switched" == true && "$applied" == false ]]; then
    if [[ -n "$backup" ]]; then
      if mv -f -- "$backup" "$target"; then
        echo 'De vorige Keepit-nginx-config is teruggezet.' >&2
      else
        echo "Kon de vorige config niet terugzetten. De kopie staat in $backup." >&2
        status=1
      fi
    elif ! rm -f -- "$target"; then
      echo "Kon de nieuwe config niet verwijderen: $target" >&2
      status=1
    fi
    if [[ "$reload_attempted" == true ]]; then
      if ! nginx -t || ! systemctl reload nginx; then
        echo 'Ook herladen van de vorige configuratie lukte niet. Controleer nginx handmatig.' >&2
        status=1
      fi
    fi
  fi
  for file in "$candidate" "$dump" "$diagnostics"; do
    if [[ -n "$file" ]]; then rm -f -- "$file"; fi
  done
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

unchanged=false
if [[ -f "$target" ]]; then
  if cmp -s -- "$source_conf" "$target"; then
    unchanged=true
  elif [[ "$(head -n 1 -- "$target")" != "$marker" && "$adopt" != true ]] &&
       ! cmp -s -- <(tail -n +2 -- "$source_conf") "$target"; then
    echo "Niet gewijzigd: $target wordt nog niet door Keepit beheerd." >&2
    echo 'Vergelijk de bestanden. Gebruik --adopt alleen als Keepit deze config mag overnemen.' >&2
    exit 1
  fi
fi

dump=$(mktemp "$config_dir/.keepit-nginx-dump.XXXXXX")
diagnostics=$(mktemp "$config_dir/.keepit-nginx-diagnostics.XXXXXX")
if [[ "$unchanged" == false ]]; then
  candidate=$(mktemp "$config_dir/.keepit-nginx-candidate.XXXXXX")
  install -m 0644 -- "$source_conf" "$candidate"
  if [[ -f "$target" ]]; then
    backup=$(mktemp "$config_dir/.keepit-nginx-previous.XXXXXX")
    cp -p -- "$target" "$backup"
  fi
  switched=true
  mv -f -- "$candidate" "$target"
fi

# -T performs the syntax check and confirms that nginx actually includes this file.
if ! nginx -T >"$dump" 2>"$diagnostics"; then
  cat -- "$diagnostics" >&2
  exit 1
fi
if ! grep -Fxq -- "# configuration file $target:" "$dump"; then
  echo "Nginx laadt $target niet. Controleer de include in nginx.conf." >&2
  exit 1
fi
if grep -Fq 'conflicting server name' "$diagnostics"; then
  cat -- "$diagnostics" >&2
  echo 'Nginx meldt een dubbel server_name. Controleer conf.d en sites-enabled.' >&2
  exit 1
fi

if [[ "$unchanged" == true && "$force_reload" == false ]]; then
  echo 'Keepit-nginx-config is geldig en ongewijzigd; nginx blijft draaien zoals het is.'
  exit 0
fi

reload_attempted=true
if ! systemctl reload nginx; then
  echo 'Nginx kon niet worden herladen.' >&2
  exit 1
fi
applied=true
echo "Keepit-nginx-config actief: $target"
if [[ -n "$backup" ]]; then
  echo "Vorige versie: $backup"
fi
