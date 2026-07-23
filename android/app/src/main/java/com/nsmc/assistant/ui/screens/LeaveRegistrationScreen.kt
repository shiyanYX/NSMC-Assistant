package com.nsmc.assistant.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.nsmc.assistant.LoginState
import com.nsmc.assistant.RustBridge
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LeaveRegistrationScreen(loginState: LoginState) {
    var xg2User by remember { mutableStateOf("") }
    var xg2Pass by remember { mutableStateOf("") }
    var loggedIn by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var successMsg by remember { mutableStateOf("") }
    var listData by remember { mutableStateOf<JsonObject?>(null) }
    var page by remember { mutableStateOf("login") }
    val scope = rememberCoroutineScope()

    if (!loggedIn) {
        Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center) {
            Text("节假日去向登记", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Text("请输入学工系统账号密码", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(24.dp))
            if (error.isNotEmpty()) { Text(error, color = MaterialTheme.colorScheme.error, fontSize = 13.sp); Spacer(Modifier.height(8.dp)) }
            OutlinedTextField(value = xg2User, onValueChange = { xg2User = it }, label = { Text("学工号") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(value = xg2Pass, onValueChange = { xg2Pass = it }, label = { Text("密码") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(20.dp))
            Button(onClick = {
                if (xg2User.isBlank() || xg2Pass.isBlank()) { error = "请输入学工号和密码"; return@Button }
                scope.launch {
                    loading = true; error = ""
                    try {
                        listData = withContext(Dispatchers.IO) { RustBridge.xg2Login(xg2User.trim(), xg2Pass.trim()) }
                        loggedIn = true; page = "list"
                    } catch (e: Exception) { error = e.message ?: "登录失败" }
                    finally { loading = false }
                }
            }, enabled = !loading, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                if (loading) { CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp); Spacer(Modifier.width(8.dp)) }
                Text(if (loading) "登录中..." else "开始登记")
            }
        }
    } else {
        val data = listData ?: return
        Column(Modifier.fillMaxSize().padding(12.dp)) {
            if (successMsg.isNotEmpty()) { Text(successMsg, color = MaterialTheme.colorScheme.primary, fontSize = 13.sp); Spacer(Modifier.height(4.dp)) }
            if (error.isNotEmpty()) { Text(error, color = MaterialTheme.colorScheme.error, fontSize = 13.sp); Spacer(Modifier.height(4.dp)) }

            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp)) {
                    Text(data.get("holiday_name")?.asString ?: "", fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.height(4.dp))
                    Text("${data.get("begin_date")?.asString ?: ""} ~ ${data.get("end_date")?.asString ?: ""}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Spacer(Modifier.height(8.dp))

            FilterChip(
                selected = false,
                onClick = {
                    scope.launch {
                        loading = true; error = ""
                        try {
                            withContext(Dispatchers.IO) { RustBridge.xg2EditForm(xg2User) }
                            page = "form"
                        } catch (e: Exception) { error = e.message ?: "获取表单失败" }
                        finally { loading = false }
                    }
                },
                label = { Text("+ 新增去向登记", fontSize = 12.sp) }
            )

            Spacer(Modifier.height(8.dp))
            Text("历史记录", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)

            val records = data.getAsJsonArray("records")
            if (records != null && records.size() > 0) {
                LazyColumn {
                    items(records.map { it.asJsonObject }) { r ->
                        Card(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                            Column(Modifier.padding(10.dp)) {
                                Text(r.get("holiday")?.asString ?: "", fontWeight = FontWeight.Medium, fontSize = 13.sp)
                                Text(r.get("time_range")?.asString ?: "", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(r.get("destination")?.asString ?: "", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            } else {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("暂无记录", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
