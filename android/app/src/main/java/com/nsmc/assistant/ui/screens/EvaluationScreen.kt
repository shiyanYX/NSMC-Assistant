package com.nsmc.assistant.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.gson.JsonObject
import com.nsmc.assistant.LoginState
import com.nsmc.assistant.RustBridge
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EvaluationScreen(loginState: LoginState) {
    var teachers by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var info by remember { mutableStateOf("") }
    var progressText by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    fun fetchList() {
        scope.launch {
            loading = true; error = ""; info = ""
            try {
                val data = withContext(Dispatchers.IO) { RustBridge.evaluationList(loginState.username, loginState.password) }
                val arr = data.getAsJsonArray("teachers")
                teachers = arr?.map { it.asJsonObject } ?: emptyList()
                val total = data.get("total")?.asInt ?: 0
                val submitted = data.get("submitted")?.asInt ?: 0
                info = "共 $total 人，已提交 $submitted，待评 ${total - submitted}"
            } catch (e: Exception) { error = e.message ?: "获取评教列表失败" }
            finally { loading = false }
        }
    }

    LaunchedEffect(Unit) { fetchList() }

    val unsubmitted = teachers.filter { t -> t.get("submitted")?.asString != "是" }
    val submittedCount = teachers.size - unsubmitted.size

    Column(Modifier.fillMaxSize().padding(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(selected = false, onClick = { fetchList() }, label = { Text("刷新列表", fontSize = 12.sp) })
            if (unsubmitted.isNotEmpty()) {
                FilterChip(
                    selected = false,
                    onClick = {
                        scope.launch {
                            submitting = true; error = ""; info = ""
                            var ok = 0; var fail = 0
                            for ((i, t) in unsubmitted.withIndex()) {
                                progressText = "[${i + 1}/${unsubmitted.size}] ${t.get("teacher_name")?.asString ?: ""}"
                                try {
                                    val result = withContext(Dispatchers.IO) {
                                        RustBridge.evaluationSubmit(loginState.username, loginState.password, t.toString(), true)
                                    }
                                    if (result.get("success")?.asBoolean == true) ok++ else fail++
                                } catch (_: Exception) { fail++ }
                            }
                            progressText = ""
                            submitting = false
                            if (fail == 0) info = "评教完成！全部成功"
                            else error = "$ok 成功, $fail 失败"
                            fetchList()
                        }
                    },
                    label = { Text("一键评教 ($unsubmitted)", fontSize = 12.sp) }
                )
            }
        }

        if (info.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(info, fontSize = 13.sp, color = MaterialTheme.colorScheme.primary)
        }
        if (error.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(error, fontSize = 13.sp, color = MaterialTheme.colorScheme.error)
        }
        if (progressText.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(4.dp))
            Text(progressText, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatCard("总人数", "${teachers.size}", Modifier.weight(1f))
            StatCard("已提交", "$submittedCount", Modifier.weight(1f))
            StatCard("待评", "${unsubmitted.size}", Modifier.weight(1f))
        }

        Spacer(Modifier.height(8.dp))

        if (loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        } else if (teachers.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("暂无评价数据", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            Card(Modifier.fillMaxWidth()) {
                val scrollState = rememberScrollState()
                Column(Modifier.horizontalScroll(scrollState)) {
                    Row(Modifier.background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 8.dp, vertical = 6.dp)) {
                        Text("#", Modifier.width(28.dp), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("教师姓名", Modifier.width(80.dp), fontSize = 11.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("所属院系", Modifier.width(100.dp), fontSize = 11.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("评教类别", Modifier.width(70.dp), fontSize = 11.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("状态", Modifier.width(60.dp), fontSize = 11.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    LazyColumn {
                        items(teachers.withIndex().toList()) { (i, t) ->
                            val done = t.get("submitted")?.asString == "是"
                            Row(Modifier.padding(horizontal = 8.dp, vertical = 5.dp)) {
                                Text(t.get("seq")?.asString ?: "${i+1}", Modifier.width(28.dp), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(t.get("teacher_name")?.asString ?: "", Modifier.width(80.dp), fontSize = 12.sp, maxLines = 1)
                                Text(t.get("dept")?.asString ?: "", Modifier.width(100.dp), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                                Text(t.get("eval_type")?.asString ?: "", Modifier.width(70.dp), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                                Surface(
                                    color = if (done) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.errorContainer,
                                    shape = MaterialTheme.shapes.small
                                ) {
                                    Text(
                                        if (done) "已提交" else "待评",
                                        Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                        fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                                        color = if (done) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                                    )
                                }
                            }
                            HorizontalDivider()
                        }
                    }
                }
            }
        }
    }
}
