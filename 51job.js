const https = require('https');
const cheerio = require('cheerio');
const xlsx = require('node-xlsx');
const fs = require('fs');
const iconv = require('iconv-lite');

process.on('uncaughtException', function (err) {
    // console.log('Caught exception: ' + err);
});
// 已经处理的信息数量
let index = 0;
let httpNum = 0;
let pageArr = [];
let keepgoing = true;

let resArr = [['招聘单位', '招聘岗位', '岗位需求', '单位地址', '学位要求', '所需经验', '最低薪资', '最高薪资']];
/**
 * 单个请求
 * @param {string} url 访问的地址
 * @param {number} level 判断处理方式，如果level=1，则获取a标签内容，如果level = 2，则分析网页取数据
 */
function request(url, level, page) {
    httpNum ++;
    return new Promise((resolve, reject) => {
        if (keepgoing) {
            https.get(url, (res) => {
                var length = 0;
                var arr = [];
                res.on('data', (chunk) => {
                    arr.push(chunk);
                    length += chunk.length;
                })
                res.on('error', (err) => {
                    console.log("此网页存在异常");
                })
                res.on('end', () => {
                    if (page) {
                        pageArr[page] = null;
                    }
                    var data = Buffer.concat(arr, length);
                    if (level === 1) {
                        getUrl(data);
                    } else {
                        var change_data = iconv.decode(data, 'gb2312');
                        filterChapter(change_data);
                    }
                    resolve();
                })
            })
        } else {
            reject()
        }
    })
}
/**
 * 用来获取列表的url
 * @param {*} html 
 */
const getUrl = (html) => {
    let $ = cheerio.load(html);
    let items = $("#resultList").children();
    for (let i = 1; i <= 49; i++ ) {
        let url = items.eq(i).find("span").find('a').attr("href");
        if (url) {
            request(url, 2);
        }
    }
}

// 分析html结构，抽取关键信息
const filterChapter = (html) => {
    let $ = cheerio.load(html);

    let company_name = $('.cname').text().replace("查看所有职位", "").trim();
    if (company_name === "") {
        index ++;
        console.log(`已处理${index}/${1000 * 50}`);
        console.log(url + "有问题");
        return;
    }
    let title = $("h1", ".cn").text();
    let need = $('.job_msg').text();
    need = need.substring(0, need.indexOf("职能类别")).trim();
    let infoArr = $(".msg").text().split("|");
    let city = "";
    let degree = "";
    let experenss = "";
    infoArr.forEach((item, index) => {
        if (item.indexOf("区") > 0) {
            city = item.trim();
        }
        if (item.indexOf("年") > 0) {
            experenss = item.trim();
        } else {
            experenss = "不限";
        }
        if (item.indexOf("本") > 0 || item.indexOf("专") > 0 || item.indexOf("硕") > 0 || item.indexOf("博") > 0) {
            degree = item.trim();
        } else {
            degree = "不限";
        }
    })

    let salary = $("strong", ".cn").text();
    let lowSalary = "面议";
    let highSalary = "面议";
    if (salary !== "面议") {
        if (salary.indexOf("万") > 0 && salary.indexOf("-") > 0) {
            lowSalary = salary.replace("万/月", "").split("-")[0] * 10000;
            highSalary = salary.replace("万/月", "").split("-")[1] * 10000;
        } else if (salary.indexOf("千") > 0) {
            lowSalary = salary.replace("千/月", "").split("-")[0];
            highSalary = salary.replace("千/月", "").split("-")[1];
        } else {
            lowSalary = highSalary = salary;
        }
    }

    if (salary !== "面议" && parseInt(lowSalary) < 100 && parseInt(highSalary) < 100 ) {
        lowSalary = parseInt(lowSalary) * 1000;
        highSalary = parseInt(highSalary) * 1000;
    }

    console.log('company:' + company_name);
    console.log('title:' + title);
    console.log('need:' + need);
    console.log('city:' + city);
    console.log('degree:' + degree);
    console.log('experenss' + experenss);
    console.log('lowSalary' + lowSalary);
    console.log('highSalary' + highSalary);

    // 去除为undefined的页面
    if (company_name) {
        resArr.push([company_name, title, need, city, degree, experenss, lowSalary, highSalary]);
        index ++;
        console.log(`已处理${index}/${1000 * 50}`);
    }
}
// 写成excel文件
const writeFile = () => {
    let data = [{
        name: "sheet1",
        data: resArr
    }];
    let buffer = xlsx.build(data);
    fs.writeFile('51job.xlsx', buffer, function (err) {
        if (err) {
            console.log("写文件失败，错误信息：" + err);
            return;
        }
        console.log("写文件已成功结束");
    });
}

const app = () => {

    let promiseGroup = [];
    // 51job
    for (let i = 1; i <= 1000; i++) {
        console.log(`正在构建promisegroup：进度${i}/1000`)
        pageArr.push(i);
        promiseGroup.push(request(`https://search.51job.com/list/000000,000000,0000,00,9,99,%25E6%2595%2599%25E5%25B8%2588,2,${i}.html?lang=c&postchannel=0000&workyear=99&cotype=99&degreefrom=99&jobterm=99&companysize=99&ord_field=0&dibiaoid=0&line=&welfare=`, 1, i));
    }

    Promise.all(promiseGroup).then(() => {
        console.log("信息爬取完毕，开始导出excel");
        writeFile();
    })
    .catch(err => {
    })
    // 四分钟后开始导出excel，放弃之后所爬取的内容
    setTimeout(() => {
        console.log(`第${pageArr.join(',')}未处理`);
        console.log("时间结束，开始导出excel");
        keepgoing = false;
        writeFile();
    }, 1000 * 60 * 4)
}

app();