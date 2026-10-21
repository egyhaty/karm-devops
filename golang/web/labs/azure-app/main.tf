resource "azurerm_resource_group" "lab" {
  name     = var.name
  location = var.location
  tags     = { Purpose = "cloud-learning" }
}
resource "azurerm_virtual_network" "lab" {
  name                = "lab-vnet"
  location            = var.location
  resource_group_name = azurerm_resource_group.lab.name
  address_space       = ["10.60.0.0/16"]
}
resource "azurerm_subnet" "app" {
  name                 = "app"
  resource_group_name  = azurerm_resource_group.lab.name
  virtual_network_name = azurerm_virtual_network.lab.name
  address_prefixes     = ["10.60.10.0/24"]
}
resource "azurerm_subnet" "endpoints" {
  name                 = "endpoints"
  resource_group_name  = azurerm_resource_group.lab.name
  virtual_network_name = azurerm_virtual_network.lab.name
  address_prefixes     = ["10.60.20.0/24"]
}
resource "azurerm_network_security_group" "app" {
  name                = "app-nsg"
  location            = var.location
  resource_group_name = azurerm_resource_group.lab.name
  security_rule {
    name                       = "app-from-lab-subnet"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "8080"
    source_address_prefixes    = var.app_client_cidrs
    destination_address_prefix = "*"
  }
  security_rule {
    name                       = "load-balancer-probe"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "8080"
    source_address_prefix      = "AzureLoadBalancer"
    destination_address_prefix = "*"
  }
  security_rule {
    name                       = "deny-other-inbound"
    priority                   = 4000
    direction                  = "Inbound"
    access                     = "Deny"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}
resource "azurerm_subnet_network_security_group_association" "app" {
  subnet_id                 = azurerm_subnet.app.id
  network_security_group_id = azurerm_network_security_group.app.id
}
resource "azurerm_route_table" "app" {
  name                = "app-routes"
  location            = var.location
  resource_group_name = azurerm_resource_group.lab.name
}
resource "azurerm_subnet_route_table_association" "app" {
  subnet_id      = azurerm_subnet.app.id
  route_table_id = azurerm_route_table.app.id
}
resource "azurerm_public_ip" "nat" {
  name                = "nat-egress-ip"
  location            = var.location
  resource_group_name = azurerm_resource_group.lab.name
  allocation_method   = "Static"
  sku                 = "Standard"
}
resource "azurerm_nat_gateway" "app" {
  name                = "explicit-egress"
  location            = var.location
  resource_group_name = azurerm_resource_group.lab.name
  sku_name            = "Standard"
}
resource "azurerm_nat_gateway_public_ip_association" "app" {
  nat_gateway_id       = azurerm_nat_gateway.app.id
  public_ip_address_id = azurerm_public_ip.nat.id
}
resource "azurerm_subnet_nat_gateway_association" "app" {
  subnet_id      = azurerm_subnet.app.id
  nat_gateway_id = azurerm_nat_gateway.app.id
}
# App access is private-endpoint-only. Keep trusted-service bypass disabled
# rather than opening an unused exception to the deny-by-default network rules.
#trivy:ignore:AVD-AZU-0010
resource "azurerm_storage_account" "data" {
  name                            = var.storage_account_name
  location                        = var.location
  resource_group_name             = azurerm_resource_group.lab.name
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  shared_access_key_enabled       = false
  public_network_access_enabled   = false
  allow_nested_items_to_be_public = false
  network_rules {
    default_action = "Deny"
    bypass         = ["None"]
  }
}
resource "azurerm_storage_container" "lab" {
  name                  = "lab"
  storage_account_id    = azurerm_storage_account.data.id
  container_access_type = "private"
}
resource "azurerm_private_dns_zone" "blob" {
  name                = "privatelink.blob.core.windows.net"
  resource_group_name = azurerm_resource_group.lab.name
}
resource "azurerm_private_dns_zone_virtual_network_link" "blob" {
  name                  = "lab-vnet-link"
  resource_group_name   = azurerm_resource_group.lab.name
  private_dns_zone_name = azurerm_private_dns_zone.blob.name
  virtual_network_id    = azurerm_virtual_network.lab.id
}
resource "azurerm_private_endpoint" "blob" {
  name                = "blob-endpoint"
  location            = var.location
  resource_group_name = azurerm_resource_group.lab.name
  subnet_id           = azurerm_subnet.endpoints.id
  private_service_connection {
    name                           = "blob"
    private_connection_resource_id = azurerm_storage_account.data.id
    subresource_names              = ["blob"]
    is_manual_connection           = false
  }
  private_dns_zone_group {
    name                 = "blob-zone"
    private_dns_zone_ids = [azurerm_private_dns_zone.blob.id]
  }
}
resource "azurerm_lb" "app" {
  name                = "private-app-lb"
  location            = var.location
  resource_group_name = azurerm_resource_group.lab.name
  sku                 = "Standard"
  frontend_ip_configuration {
    name                          = "private"
    subnet_id                     = azurerm_subnet.app.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.60.10.10"
  }
}
resource "azurerm_lb_backend_address_pool" "app" {
  name            = "app"
  loadbalancer_id = azurerm_lb.app.id
}
resource "azurerm_lb_probe" "app" {
  name            = "http-health"
  loadbalancer_id = azurerm_lb.app.id
  protocol        = "Http"
  port            = 8080
  request_path    = "/healthz"
}
resource "azurerm_lb_rule" "app" {
  name                           = "http-8080"
  loadbalancer_id                = azurerm_lb.app.id
  protocol                       = "Tcp"
  frontend_port                  = 8080
  backend_port                   = 8080
  frontend_ip_configuration_name = "private"
  backend_address_pool_ids       = [azurerm_lb_backend_address_pool.app.id]
  probe_id                       = azurerm_lb_probe.app.id
  disable_outbound_snat          = true
}
resource "azurerm_network_interface" "app" {
  name                = "app-nic"
  location            = var.location
  resource_group_name = azurerm_resource_group.lab.name
  ip_configuration {
    name                          = "private"
    subnet_id                     = azurerm_subnet.app.id
    private_ip_address_allocation = "Dynamic"
  }
}
resource "azurerm_network_interface_backend_address_pool_association" "app" {
  network_interface_id    = azurerm_network_interface.app.id
  ip_configuration_name   = "private"
  backend_address_pool_id = azurerm_lb_backend_address_pool.app.id
}
resource "azurerm_linux_virtual_machine" "app" {
  name                            = "lab-app"
  location                        = var.location
  resource_group_name             = azurerm_resource_group.lab.name
  size                            = var.vm_size
  admin_username                  = "laboperator"
  disable_password_authentication = true
  network_interface_ids           = [azurerm_network_interface.app.id]
  identity { type = "SystemAssigned" }
  admin_ssh_key {
    username   = "laboperator"
    public_key = file(pathexpand(var.ssh_public_key_path))
  }
  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }
  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts-gen2"
    version   = "latest"
  }
  custom_data = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {
    app = file("${path.module}/app.py"), storage_account = var.storage_account_name
  }))
  depends_on = [azurerm_nat_gateway_public_ip_association.app, azurerm_subnet_nat_gateway_association.app, azurerm_subnet_network_security_group_association.app]
}
resource "azurerm_role_assignment" "blob" {
  scope                = azurerm_storage_account.data.id
  role_definition_name = "Storage Blob Data Reader"
  principal_id         = azurerm_linux_virtual_machine.app.identity[0].principal_id
}
resource "azurerm_network_interface" "probe" {
  count               = var.enable_probe ? 1 : 0
  name                = "probe-nic"
  location            = var.location
  resource_group_name = azurerm_resource_group.lab.name
  ip_configuration {
    name                          = "private"
    subnet_id                     = azurerm_subnet.app.id
    private_ip_address_allocation = "Dynamic"
  }
}
resource "azurerm_linux_virtual_machine" "probe" {
  count                           = var.enable_probe ? 1 : 0
  name                            = "lab-probe"
  location                        = var.location
  resource_group_name             = azurerm_resource_group.lab.name
  size                            = var.vm_size
  admin_username                  = "laboperator"
  disable_password_authentication = true
  network_interface_ids           = [azurerm_network_interface.probe[0].id]
  admin_ssh_key {
    username   = "laboperator"
    public_key = file(pathexpand(var.ssh_public_key_path))
  }
  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }
  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts-gen2"
    version   = "latest"
  }
  depends_on = [azurerm_nat_gateway_public_ip_association.app, azurerm_subnet_nat_gateway_association.app]
}
output "resource_group_name" { value = azurerm_resource_group.lab.name }
output "vm_name" { value = azurerm_linux_virtual_machine.app.name }
output "nic_name" { value = azurerm_network_interface.app.name }
output "storage_account_name" { value = azurerm_storage_account.data.name }
output "storage_fqdn" { value = "${azurerm_storage_account.data.name}.blob.core.windows.net" }
output "internal_lb_ip" { value = azurerm_lb.app.frontend_ip_configuration[0].private_ip_address }
output "probe_vm_name" { value = var.enable_probe ? azurerm_linux_virtual_machine.probe[0].name : "disabled" }
