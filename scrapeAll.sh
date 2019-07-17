#!/usr/bin/env bash
echo "---starting script---" && date
echo $PWD
export NODE_PATH="$PWD/node_modules"
start=`date +%s`
echo "< dbclean ..." && /usr/local/bin/node dbClean.js && echo "... dbclean >" &&
wait

# echo "< talabat ..." && /usr/local/bin/node talabat.js && echo "... talabat >" &&
# wait

echo "< deliveroo ..." && /usr/local/bin/node deliveroo.js && echo "... deliveroo >" &&
wait

echo "< carriage ..." && /usr/local/bin/node carriage.js && echo "... carriage >" &&
wait

echo "< zomato ..." && /usr/local/bin/node zomato.js && echo "... zomato >" &&
wait

/usr/local/bin/node reindex.js
wait

echo "---script done---"
date
end=`date +%s`
runtime=$((end-start))
echo "$runtime"